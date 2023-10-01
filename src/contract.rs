#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{Binary, Deps, DepsMut, Env, MessageInfo, Response, StdError, StdResult};
use cw2::set_contract_version;

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, MigrateMsg, QueryMsg};
use crate::state::STAGE;

// version info for migration info
const CONTRACT_NAME: &str = "crates.io:neutron-airdrop-transfer";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    STAGE.save(deps.storage, &ExecuteMsg::ClaimUnclaimed {})?;
    Ok(Response::default())
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    let current_stage = STAGE.load(deps.storage)?;
    if current_stage != msg {
        // TODO: save what stage should be in the error
        return Err(ContractError::IncorrectStage {});
    }

    match msg {
        ExecuteMsg::ClaimUnclaimed {} => execute_claim_unclaimed(deps),
        ExecuteMsg::CreateHubICA {} => execute_create_hub_ica(deps),
        ExecuteMsg::SendClaimedTokensToICA {} => send_claimed_tokens_to_ica(deps),
        ExecuteMsg::SendTokensToCommunityPool {} => send_tokens_to_community_pool(deps),
        ExecuteMsg::Done {} => execute_done(),
    }
}

fn execute_claim_unclaimed(deps: DepsMut) -> Result<Response, ContractError> {
    STAGE.save(deps.storage, &ExecuteMsg::CreateHubICA {})?;
    // TODO: transfer

    Ok(Response::default())
}

fn execute_create_hub_ica(deps: DepsMut) -> Result<Response, ContractError> {
    STAGE.save(deps.storage, &ExecuteMsg::SendClaimedTokensToICA {})?;

    Ok(Response::default())
}

fn send_claimed_tokens_to_ica(deps: DepsMut) -> Result<Response, ContractError> {
    STAGE.save(deps.storage, &ExecuteMsg::SendTokensToCommunityPool {})?;

    Ok(Response::default())
}

fn send_tokens_to_community_pool(deps: DepsMut) -> Result<Response, ContractError> {
    STAGE.save(deps.storage, &ExecuteMsg::Done {})?;
    Ok(Response::default())
}

fn execute_done() -> Result<Response, ContractError> {
    Err(ContractError::Std(StdError::generic_err(
        "cannot execute, sending is already done",
    )))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(_deps: Deps, _env: Env, _msg: QueryMsg) -> StdResult<Binary> {
    unimplemented!()
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(deps: DepsMut, _env: Env, _msg: MigrateMsg) -> StdResult<Response> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    Ok(Response::default())
}

#[cfg(test)]
mod tests {}
