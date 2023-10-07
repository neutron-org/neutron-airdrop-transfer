use cosmwasm_schema::{cw_serde, QueryResponses};

#[cw_serde]
pub struct InstantiateMsg {
    // connection_id between neutron-1 and cosmoshub-4 to make IBC transactions
    pub connection_id: String,

    // airdrop contract address that we claim neutrons from
    pub airdrop_address: String,

    // interchain account id we're creating (any string?)
    pub interchain_account_id: String,

    // neutron to cosmoshub transfer channel id
    pub cosmoshub_channel: String,

    // IBC denom of neutron that was sent over our `cosmoshub_channel`
    pub ibc_neutron_denom: String,

    // cosmos-hub revision number; used for ibc timeout
    pub hub_revision_number: u64,
}

#[cw_serde]
pub enum ExecuteMsg {
    ClaimUnclaimed {},
    CreateHubICA {},
    SendClaimedTokensToICA {},
    FundCommunityPool {},
    Done {},
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(crate::state::Stage)]
    Stage {},
    #[returns(Option<crate::state::InterchainAccount>)]
    InterchainAccount {},
    #[returns(cosmwasm_std::Uint128)]
    TransferAmount {},
}

#[cw_serde]
pub struct MigrateMsg {}
