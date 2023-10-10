use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::Item;

#[cw_serde]
pub enum Stage {
    ClaimUnclaimed,
    SendClaimedTokensToICA,
    FundCommunityPool,
    Done,
}

pub const CONFIG: Item<Config> = Item::new("config");

// current stage to allow for non interrupted execution of operations in strict sequence
pub const STAGE: Item<Stage> = Item::new("stage");

pub const INTERCHAIN_ACCOUNT: Item<Option<InterchainAccount>> = Item::new("interchain_account");

// amount of unclaimed neutron to transfer
pub const TRANSFER_AMOUNT: Item<Uint128> = Item::new("transfer_amount");

// if true, interchain operation is in progress and we cannot make an operation
pub const INTERCHAIN_TX_IN_PROGRESS: Item<bool> = Item::new("interchain_tx_in_progress");

#[cw_serde]
pub struct Config {
    pub connection_id: String,
    pub airdrop_address: Addr,
    pub channel_id_to_hub: String,
    pub ibc_neutron_denom: String,
}

#[cw_serde]
pub struct InterchainAccount {
    pub address: String,
    pub open: bool,
}

#[cw_serde]
pub struct OpenAckVersion {
    pub version: String,
    pub controller_connection_id: String,
    pub host_connection_id: String,
    pub address: String,
    pub encoding: String,
    pub tx_type: String,
}
