//! Contract events for indexers, keepers, and merchant dashboards.
//!
//! Fixed topic prefixes (`sub` + action) make RPC `getEvents` filters cheap.
//! Dynamic `#[topic]` fields (`subscription_id`, addresses) are indexed too.

use soroban_sdk::{contractevent, Address};

/// Emitted when a subscriber opens a new recurring bill.
#[contractevent(topics = ["sub", "created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionCreated {
    #[topic]
    pub subscription_id: u64,
    #[topic]
    pub subscriber: Address,
    #[topic]
    pub merchant: Address,
    pub token: Address,
    pub amount: i128,
    pub interval_secs: u64,
}

/// Emitted after a successful allowance pull for one billing cycle.
#[contractevent(topics = ["sub", "paid"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentProcessed {
    #[topic]
    pub subscription_id: u64,
    #[topic]
    pub subscriber: Address,
    #[topic]
    pub merchant: Address,
    pub token: Address,
    pub amount: i128,
    /// Ledger unix timestamp written to `Subscription.last_billed`.
    pub billed_at: u64,
}

/// Emitted when the subscriber deactivates a subscription.
#[contractevent(topics = ["sub", "cancelled"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubscriptionCancelled {
    #[topic]
    pub subscription_id: u64,
    #[topic]
    pub subscriber: Address,
    #[topic]
    pub merchant: Address,
}
