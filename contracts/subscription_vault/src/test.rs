#![cfg(test)]

//! Unit tests for Subscription Vault.
//! Uses soroban-sdk testutils + a deployed mock SAC token.

use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger, LedgerInfo},
    token, Address, Env, Event,
};

use crate::events::{PaymentProcessed, SubscriptionCancelled, SubscriptionCreated};
use crate::types::Error;
use crate::{SubscriptionVault, SubscriptionVaultClient};

fn setup<'a>() -> (Env, SubscriptionVaultClient<'a>, Address, Address, Address, token::Client<'a>) {
    let env = Env::default();
    env.mock_all_auths();

    // Non-zero timestamp so `last_billed == 0` remains a reliable "never billed" sentinel.
    env.ledger().set(LedgerInfo {
        timestamp: 1_700_000_000,
        protocol_version: env.ledger().get().protocol_version,
        sequence_number: 100,
        network_id: env.ledger().get().network_id,
        base_reserve: env.ledger().get().base_reserve,
        min_temp_entry_ttl: env.ledger().get().min_temp_entry_ttl,
        min_persistent_entry_ttl: env.ledger().get().min_persistent_entry_ttl,
        max_entry_ttl: env.ledger().get().max_entry_ttl,
    });

    // Deploy a classic Stellar Asset Contract (SAC) mock for USDC-like transfers.
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_contract.address();
    let token_client = token::Client::new(&env, &token_address);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    let contract_id = env.register(SubscriptionVault, ());
    let client = SubscriptionVaultClient::new(&env, &contract_id);

    let subscriber = Address::generate(&env);
    let merchant = Address::generate(&env);

    // Fund subscriber and grant vault allowance covering many cycles.
    token_admin_client.mint(&subscriber, &1_000_000_000);
    let allowance = 100_000i128 * 24; // 24 months headroom
    // Expiration must be a *future* ledger; advancing time also bumps sequence.
    let expiration = env.ledger().sequence() + 1_000_000;
    token_client.approve(&subscriber, &contract_id, &allowance, &expiration);

    client.initialize();

    (env, client, subscriber, merchant, token_address, token_client)
}

fn advance_time(env: &Env, secs: u64) {
    env.ledger().set(LedgerInfo {
        timestamp: env.ledger().timestamp() + secs,
        protocol_version: env.ledger().get().protocol_version,
        sequence_number: env.ledger().sequence() + 1,
        network_id: env.ledger().get().network_id,
        base_reserve: env.ledger().get().base_reserve,
        min_temp_entry_ttl: env.ledger().get().min_temp_entry_ttl,
        min_persistent_entry_ttl: env.ledger().get().min_persistent_entry_ttl,
        max_entry_ttl: env.ledger().get().max_entry_ttl,
    });
}

#[test]
fn create_and_process_payment_succeeds() {
    let (env, client, subscriber, merchant, token, token_client) = setup();
    let amount = 100_000i128;
    let interval = 86_400u64; // 1 day
    let vault = client.address.clone();

    let id = client.create_subscription(&subscriber, &merchant, &token, &amount, &interval);
    assert_eq!(id, 1);

    // `events().all()` is last-invocation only — assert before any later calls.
    assert_eq!(
        env.events().all().filter_by_contract(&vault),
        std::vec![SubscriptionCreated {
            subscription_id: id,
            subscriber: subscriber.clone(),
            merchant: merchant.clone(),
            token: token.clone(),
            amount,
            interval_secs: interval,
        }
        .to_xdr(&env, &vault)],
    );

    let before_sub = token_client.balance(&subscriber);
    let before_merch = token_client.balance(&merchant);

    // First bill is allowed immediately (last_billed == 0).
    client.process_payment(&id);

    assert_eq!(
        env.events().all().filter_by_contract(&vault),
        std::vec![PaymentProcessed {
            subscription_id: id,
            subscriber: subscriber.clone(),
            merchant: merchant.clone(),
            token: token.clone(),
            amount,
            billed_at: env.ledger().timestamp(),
        }
        .to_xdr(&env, &vault)],
    );

    assert_eq!(token_client.balance(&subscriber), before_sub - amount);
    assert_eq!(token_client.balance(&merchant), before_merch + amount);

    let sub = client.get_subscription(&id);
    assert!(sub.is_active);
    assert_eq!(sub.last_billed, env.ledger().timestamp());
    assert_eq!(sub.amount, amount);
}

#[test]
fn cancel_emits_cancelled_event() {
    let (env, client, subscriber, merchant, token, _) = setup();
    let vault = client.address.clone();
    let id = client.create_subscription(&subscriber, &merchant, &token, &10_000, &86_400);

    client.cancel_subscription(&subscriber, &id);

    assert_eq!(
        env.events().all().filter_by_contract(&vault),
        std::vec![SubscriptionCancelled {
            subscription_id: id,
            subscriber,
            merchant,
        }
        .to_xdr(&env, &vault)],
    );
}

#[test]
fn double_bill_same_interval_fails() {
    let (_env, client, subscriber, merchant, token, _token_client) = setup();
    let id = client.create_subscription(&subscriber, &merchant, &token, &50_000, &86_400);

    client.process_payment(&id);

    let result = client.try_process_payment(&id);
    assert_eq!(result, Err(Ok(Error::BillingTooEarly)));
}

#[test]
fn bill_after_interval_succeeds() {
    let (env, client, subscriber, merchant, token, token_client) = setup();
    let amount = 25_000i128;
    let interval = 86_400u64;
    let id = client.create_subscription(&subscriber, &merchant, &token, &amount, &interval);

    client.process_payment(&id);
    let mid = token_client.balance(&merchant);

    advance_time(&env, interval);
    client.process_payment(&id);

    assert_eq!(token_client.balance(&merchant), mid + amount);
}

#[test]
fn cancel_blocks_future_billing() {
    let (_env, client, subscriber, merchant, token, _token_client) = setup();
    let id = client.create_subscription(&subscriber, &merchant, &token, &10_000, &86_400);

    client.cancel_subscription(&subscriber, &id);

    let sub = client.get_subscription(&id);
    assert!(!sub.is_active);

    let result = client.try_process_payment(&id);
    assert_eq!(result, Err(Ok(Error::SubscriptionInactive)));
}

#[test]
fn cancel_requires_subscriber() {
    let (env, client, subscriber, merchant, token, _token_client) = setup();
    let id = client.create_subscription(&subscriber, &merchant, &token, &10_000, &86_400);

    let impostor = Address::generate(&env);
    let result = client.try_cancel_subscription(&impostor, &id);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn invalid_amount_rejected() {
    let (_env, client, subscriber, merchant, token, _) = setup();
    let result = client.try_create_subscription(&subscriber, &merchant, &token, &0, &86_400);
    assert_eq!(result, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn invalid_interval_rejected() {
    let (_env, client, subscriber, merchant, token, _) = setup();
    // Below MIN_INTERVAL_SECS (3600)
    let result = client.try_create_subscription(&subscriber, &merchant, &token, &100, &60);
    assert_eq!(result, Err(Ok(Error::InvalidInterval)));
}

#[test]
fn same_party_rejected() {
    let (_env, client, subscriber, _merchant, token, _) = setup();
    let result =
        client.try_create_subscription(&subscriber, &subscriber, &token, &100, &86_400);
    assert_eq!(result, Err(Ok(Error::SameParty)));
}

#[test]
fn get_missing_subscription_fails() {
    let (_env, client, _subscriber, _merchant, _token, _) = setup();
    let result = client.try_get_subscription(&999);
    assert_eq!(result, Err(Ok(Error::SubscriptionNotFound)));
}

#[test]
fn reinitialize_fails() {
    let (_env, client, _, _, _, _) = setup();
    let result = client.try_initialize();
    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn ids_increment() {
    let (_env, client, subscriber, merchant, token, _) = setup();
    let a = client.create_subscription(&subscriber, &merchant, &token, &1_000, &86_400);
    let b = client.create_subscription(&subscriber, &merchant, &token, &2_000, &86_400);
    assert_eq!(a, 1);
    assert_eq!(b, 2);
}
