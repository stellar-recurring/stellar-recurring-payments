#![no_std]

//! # Subscription Vault
//!
//! Non-custodial recurring billing on Stellar Soroban.
//!
//! ## Flow
//! 1. Subscriber approves this contract on the SAC token for
//!    `(amount * expected_cycles)` via `token.approve`.
//! 2. Subscriber calls [`SubscriptionVault::create_subscription`].
//! 3. Anyone (merchant / keeper / relayer) calls
//!    [`SubscriptionVault::process_payment`] once per interval.
//! 4. Subscriber may [`SubscriptionVault::cancel_subscription`] at any time.
//!
//! ## Safety
//! - Auth: `subscriber.require_auth()` on create / cancel.
//! - Reentrancy: `last_billed` is written **before** `transfer_from`.
//! - Rent: every mutation extends instance + entry TTL (see `storage`).
//! - Events: `sub/created`, `sub/paid`, `sub/cancelled` (see `events`).

#[cfg(test)]
extern crate std;

mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

pub use events::{PaymentProcessed, SubscriptionCancelled, SubscriptionCreated};
pub use types::{DataKey, Error, Subscription};

use soroban_sdk::{contract, contractimpl, token, Address, Env};

use crate::storage::{
    extend_instance, is_initialized, next_id, read_subscription, set_initialized, set_next_id,
    write_subscription,
};
use crate::types::{Error as VaultError, Subscription as Sub, MAX_INTERVAL_SECS, MIN_INTERVAL_SECS};

#[contract]
pub struct SubscriptionVault;

#[contractimpl]
impl SubscriptionVault {
    /// One-time setup. Marks the instance as initialized and bumps instance TTL.
    pub fn initialize(env: Env) -> Result<(), VaultError> {
        if is_initialized(&env) {
            return Err(VaultError::AlreadyInitialized);
        }
        set_initialized(&env);
        set_next_id(&env, 1);
        extend_instance(&env);
        Ok(())
    }

    /// Create a new subscription. Requires `subscriber` authorization.
    ///
    /// Returns the newly minted `subscription_id`. Does **not** pull funds;
    /// the first bill happens on the first valid `process_payment` call
    /// (immediately, since `last_billed == 0`).
    pub fn create_subscription(
        env: Env,
        subscriber: Address,
        merchant: Address,
        token: Address,
        amount: i128,
        interval_secs: u64,
    ) -> Result<u64, VaultError> {
        if !is_initialized(&env) {
            return Err(VaultError::NotInitialized);
        }

        // Auth check: only the paying party may open a subscription in their name.
        subscriber.require_auth();

        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        if !(MIN_INTERVAL_SECS..=MAX_INTERVAL_SECS).contains(&interval_secs) {
            return Err(VaultError::InvalidInterval);
        }
        if subscriber == merchant {
            return Err(VaultError::SameParty);
        }

        let id = next_id(&env);
        let sub = Sub {
            subscriber: subscriber.clone(),
            merchant: merchant.clone(),
            token: token.clone(),
            amount,
            interval_secs,
            last_billed: 0,
            is_active: true,
        };

        write_subscription(&env, id, &sub);
        set_next_id(&env, id.saturating_add(1));
        extend_instance(&env);

        // Indexable topics: id + parties; amount/interval live in event data.
        SubscriptionCreated {
            subscription_id: id,
            subscriber,
            merchant,
            token,
            amount,
            interval_secs,
        }
        .publish(&env);

        Ok(id)
    }

    /// Pull one billing cycle from subscriber → merchant via token allowance.
    ///
    /// Permissionless: keepers/relayers/merchants may invoke this. The contract
    /// enforces interval timing and active status on-chain.
    pub fn process_payment(env: Env, subscription_id: u64) -> Result<(), VaultError> {
        if !is_initialized(&env) {
            return Err(VaultError::NotInitialized);
        }

        let mut sub = read_subscription(&env, subscription_id)?;
        if !sub.is_active {
            return Err(VaultError::SubscriptionInactive);
        }

        let now = env.ledger().timestamp();
        // First bill (`last_billed == 0`) is always allowed; subsequent bills
        // require a full interval since the previous successful pull.
        if sub.last_billed != 0 && now < sub.last_billed.saturating_add(sub.interval_secs) {
            return Err(VaultError::BillingTooEarly);
        }

        // CEI: update state before external call to block reentrancy double-bills.
        sub.last_billed = now;
        write_subscription(&env, subscription_id, &sub);
        extend_instance(&env);

        let token_client = token::Client::new(&env, &sub.token);
        token_client.transfer_from(
            &env.current_contract_address(),
            &sub.subscriber,
            &sub.merchant,
            &sub.amount,
        );

        // Publish after transfer; on failure the whole call (incl. state) reverts.
        PaymentProcessed {
            subscription_id,
            subscriber: sub.subscriber,
            merchant: sub.merchant,
            token: sub.token,
            amount: sub.amount,
            billed_at: now,
        }
        .publish(&env);

        Ok(())
    }

    /// Deactivate a subscription. Requires the original subscriber's auth.
    ///
    /// Callers should also `approve(..., 0)` on the token SAC to revoke unused
    /// allowance off-chain / in the same transaction envelope.
    pub fn cancel_subscription(
        env: Env,
        subscriber: Address,
        subscription_id: u64,
    ) -> Result<(), VaultError> {
        if !is_initialized(&env) {
            return Err(VaultError::NotInitialized);
        }

        subscriber.require_auth();

        let mut sub = read_subscription(&env, subscription_id)?;
        if sub.subscriber != subscriber {
            return Err(VaultError::Unauthorized);
        }
        if !sub.is_active {
            return Err(VaultError::SubscriptionInactive);
        }

        sub.is_active = false;
        write_subscription(&env, subscription_id, &sub);
        extend_instance(&env);

        SubscriptionCancelled {
            subscription_id,
            subscriber,
            merchant: sub.merchant,
        }
        .publish(&env);

        Ok(())
    }

    /// Read-only view of a subscription (extends entry TTL as a side effect).
    pub fn get_subscription(env: Env, subscription_id: u64) -> Result<Sub, VaultError> {
        read_subscription(&env, subscription_id)
    }
}
