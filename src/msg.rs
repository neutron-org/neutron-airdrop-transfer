use cosmwasm_schema::{cw_serde, QueryResponses};

#[cw_serde]
pub struct InstantiateMsg {
    pub main_dao: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    ClaimUnclaimed {},
    CreateHubICA {},
    SendClaimedTokensToICA {},
    SendTokensToCommunityPool {},
    Done {},
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {}

#[cw_serde]
pub struct MigrateMsg {}
