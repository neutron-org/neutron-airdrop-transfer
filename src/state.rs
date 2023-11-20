use cosmwasm_schema::cw_serde;
use cosmwasm_std::Uint128;
use cw_storage_plus::Item;
use neutron_sdk::sudo::msg::RequestPacket;

pub const CONFIG: Item<Config> = Item::new("config");

pub const INTERCHAIN_ACCOUNT: Item<Option<InterchainAccount>> = Item::new("interchain_account");

// to understand what happened with IBC calls
pub const IBC_CALLBACK_STATES: Item<Vec<IbcCallbackState>> = Item::new("ibc_callback_states");

#[cw_serde]
pub struct Config {
    pub connection_id: String,
    pub transfer_channel_id: String,
    pub ibc_neutron_denom: String,
    pub ibc_timeout_seconds: u64,
    pub amount: Uint128,
}

#[cw_serde]
pub struct InterchainAccount {
    // ica address on remote network
    pub address: String,
    pub port_id: String,
    pub channel_id: String,
    pub counterparty_channel_id: String,
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

#[cw_serde]
pub enum IbcCallbackState {
    Response(RequestPacket, u64),      // request_packet, block_height
    Timeout(RequestPacket, u64),       // request_packet, block_height
    Error(RequestPacket, String, u64), // error with request_packet, details, block_height

    OpenAckError(String, u64, String, String, String, String), // parse_error, block_height, port_id, channel_id, counterparty_channel_id, counterparty_version
}
