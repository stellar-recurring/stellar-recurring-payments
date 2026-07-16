//! Shared types for the Subscription Vault protocol.
//!
//! Persistent storage keys, the core `Subscription` record, and contract errors
//! live here so entrypoints (`lib.rs`) and TTL helpers (`storage.rs`) stay lean.

use soroban_sdk::{contracterror, contracttype, Address};

/// Ledger-day approximation used for TTL budgeting.
/// Stellar mainnet targets ~5s ledgers → 86_400 / 5 = 17_280 ledgers/day.
pub const DAY_IN_LEDGERS: u32 = 17_280;

/// Extend instance + subscription entries by at least 30 days on every touch.
pub const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
/// Threshold below which we eagerly extend (avoids thrashing near expiry).
pub const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;

/// Same TTL policy for individual subscription data entries.
pub const SUBSCRIPTION_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
pub const SUBSCRIPTION_LIFETIME_THRESHOLD: u32 = SUBSCRIPTION_BUMP_AMOUNT - DAY_IN_LEDGERS;

/// Minimum allowed billing interval (1 hour) — guards against spam / griefing.
pub const MIN_INTERVAL_SECS: u64 = 3_600;

/// Maximum allowed billing interval (~1 year).
pub const MAX_INTERVAL_SECS: u64 = 31_536_000;

/// Persistent storage keys for the vault.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Monotonic counter used to mint unique subscription IDs.
    NextId,
    /// Maps `subscription_id → Subscription`.
    Subscription(u64),
    /// One-time init guard.
    Initialized,
}

/// On-ledger subscription state.
///
/// `last_billed` is updated **before** the token transfer so a reentrant
/// `process_payment` cannot double-bill within the same interval.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Subscription {
    pub subscriber: Address,
    pub merchant: Address,
    pub token: Address,
    /// Amount pulled per billing cycle (token's smallest unit).
    pub amount: i128,
    /// Seconds between successful bills.
    pub interval_secs: u64,
    /// Unix timestamp of the most recent successful bill (0 = never billed).
    pub last_billed: u64,
    /// Soft-cancel flag; inactive subs reject further `process_payment` calls.
    pub is_active: bool,
}

/// Contract-level errors. Mapped to Soroban error codes for clients/SDK.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `initialize` was already called.
    AlreadyInitialized = 1,
    /// Contract has not been initialized yet.
    NotInitialized = 2,
    /// Referenced subscription ID does not exist.
    SubscriptionNotFound = 3,
    /// Subscription was cancelled or otherwise inactive.
    SubscriptionInactive = 4,
    /// Billing attempted before `last_billed + interval_secs`.
    BillingTooEarly = 5,
    /// Caller is not authorized for this action.
    Unauthorized = 6,
    /// Amount must be strictly positive.
    InvalidAmount = 7,
    /// Interval outside `[MIN_INTERVAL_SECS, MAX_INTERVAL_SECS]`.
    InvalidInterval = 8,
    /// Merchant and subscriber must be distinct addresses.
    SameParty = 9,
}
