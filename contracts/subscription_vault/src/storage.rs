//! Persistent storage helpers with explicit Soroban TTL / rent management.
//!
//! Every create / update / process path must call these helpers so instance and
//! subscription entries stay alive while the subscription is active.

use soroban_sdk::Env;

use crate::types::{
    DataKey, Error, Subscription, INSTANCE_BUMP_AMOUNT, INSTANCE_LIFETIME_THRESHOLD,
    SUBSCRIPTION_BUMP_AMOUNT, SUBSCRIPTION_LIFETIME_THRESHOLD,
};

/// Extend the contract instance TTL (holds `NextId` / `Initialized` metadata).
pub fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

/// Extend a single subscription entry's TTL after it is read or written.
pub fn extend_subscription(env: &Env, id: u64) {
    let key = DataKey::Subscription(id);
    env.storage().persistent().extend_ttl(
        &key,
        SUBSCRIPTION_LIFETIME_THRESHOLD,
        SUBSCRIPTION_BUMP_AMOUNT,
    );
}

pub fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Initialized)
}

pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&DataKey::Initialized, &true);
}

pub fn next_id(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::NextId)
        .unwrap_or(1u64)
}

pub fn set_next_id(env: &Env, id: u64) {
    env.storage().instance().set(&DataKey::NextId, &id);
}

pub fn write_subscription(env: &Env, id: u64, sub: &Subscription) {
    let key = DataKey::Subscription(id);
    env.storage().persistent().set(&key, sub);
    // Touch TTL immediately after write so archival rent is paid up front.
    extend_subscription(env, id);
}

pub fn read_subscription(env: &Env, id: u64) -> Result<Subscription, Error> {
    let key = DataKey::Subscription(id);
    let sub = env
        .storage()
        .persistent()
        .get::<_, Subscription>(&key)
        .ok_or(Error::SubscriptionNotFound)?;
    extend_subscription(env, id);
    Ok(sub)
}
