use cosmwasm_schema::cw_serde;
use cosmwasm_std::Addr;
use crate::msg::ExecuteMsg;
use cw_storage_plus::Item;

pub type Stage = ExecuteMsg;

pub const CONFIG: Item<Config> = Item::new("config");

// current stage to allow for non interrupted execution of operations in strict sequence
pub const STAGE: Item<Stage> = Item::new("stage");

pub const INTERCHAIN_ACCOUNT: Item<Option<InterchainAccount>> =
    Item::new("interchain_account");

#[cw_serde]
pub struct Config {
    pub connection_id: String,
    pub airdrop_address: Addr,
    // pub register_fee: Vec<CoinSDK>,
    pub interchain_account_id: String,
    pub cosmoshub_channel: String,
    pub cosmoshub_community_pool_address: String,
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
