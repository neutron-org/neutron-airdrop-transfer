use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::Item;
use neutron_sdk::sudo::msg::RequestPacket;

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

// to understand what happened with IBC calls
pub const IBC_CALLBACK_STATES: Item<Vec<IbcCallbackState>> = Item::new("ibc_callback_states");

#[cw_serde]
pub struct Config {
    pub connection_id: String,
    pub airdrop_address: Addr,
    pub channel_id_to_hub: String,
    pub ibc_neutron_denom: String,
    pub ica_timeout_seconds: u64,
}

#[cw_serde]
pub struct InterchainAccount {
    // ica address on remote network
    pub address: String,
    pub port_id: String,
    pub channel_id: String,
    pub counterparty_channel_id: String,
}

// TODO: can we import it from library?
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
}
