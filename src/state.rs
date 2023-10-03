use crate::msg::ExecuteMsg;
use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::Item;

pub type Stage = ExecuteMsg;

pub const CONFIG: Item<Config> = Item::new("config");

// current stage to allow for non interrupted execution of operations in strict sequence
pub const STAGE: Item<Stage> = Item::new("stage");

pub const INTERCHAIN_ACCOUNT: Item<Option<InterchainAccount>> = Item::new("interchain_account");

// amount of unclaimed neutron to transfer
pub const TRANSFER_AMOUNT: Item<Uint128> = Item::new("transfer_amount");

#[cw_serde]
pub struct Config {
    pub connection_id: String,
    pub airdrop_address: Addr,
    pub interchain_account_id: String,
    pub channel_id_to_hub: String,
    pub hub_community_pool_address: String,
    pub hub_revision_number: u64,
    pub ibc_neutron_denom: String,
}

#[cw_serde]
pub struct InterchainAccount {
    pub port_id: String,
    pub address: String,
    pub controller_connection_id: String,
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
