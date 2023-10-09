use cosmos_sdk_proto::cosmos::base::v1beta1::Coin as CosmosCoin;
use cosmos_sdk_proto::cosmos::distribution::v1beta1::MsgFundCommunityPool;
#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_binary, Binary, Coin, CosmosMsg, Deps, DepsMut, Env, MessageInfo, Response, StdError,
    StdResult, Uint128, WasmMsg,
};
use cw2::set_contract_version;
use prost::Message;
use serde_json_wasm;

use neutron_sdk::bindings::msg::{IbcFee, NeutronMsg};
use neutron_sdk::bindings::query::NeutronQuery;
use neutron_sdk::bindings::types::ProtobufAny;
use neutron_sdk::query::min_ibc_fee::query_min_ibc_fee;
use neutron_sdk::sudo::msg::{RequestPacket, RequestPacketTimeoutHeight, SudoMsg};
use neutron_sdk::{NeutronError, NeutronResult};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, MigrateMsg, QueryMsg};
use crate::outer::cw20_merkle_airdrop;
use crate::state::{
    Config, InterchainAccount, OpenAckVersion, CONFIG, INTERCHAIN_ACCOUNT, STAGE, TRANSFER_AMOUNT,
};

// version info for migration info
const CONTRACT_NAME: &str = "crates.io:neutron-airdrop-transfer";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

// Default timeout for IbcTransfer is 10000000 blocks
const DEFAULT_TIMEOUT_HEIGHT: u64 = 10000000;
const NEUTRON_DENOM: &str = "untrn";

const TRANSFER_PORT: &str = "transfer";

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    STAGE.save(deps.storage, &ExecuteMsg::ClaimUnclaimed {})?;
    CONFIG.save(
        deps.storage,
        &Config {
            connection_id: msg.connection_id,
            airdrop_address: deps.api.addr_validate(&msg.airdrop_address)?,
            interchain_account_id: msg.interchain_account_id,
            channel_id_to_hub: msg.channel_id_to_hub,
            ibc_neutron_denom: msg.ibc_neutron_denom,
        },
    )?;
    Ok(Response::default())
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut<NeutronQuery>,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> NeutronResult<Response<NeutronMsg>> {
    let current_stage = STAGE.load(deps.storage)?;
    if current_stage != msg {
        return Err(NeutronError::Std(StdError::generic_err(format!(
            "incorrect stage: {:?}",
            current_stage
        ))));
    }

    match msg {
        ExecuteMsg::ClaimUnclaimed {} => execute_claim_unclaimed(deps, env),
        ExecuteMsg::CreateHubICA {} => execute_create_hub_ica(deps, env),
        ExecuteMsg::SendClaimedTokensToICA {} => {
            execute_send_claimed_tokens_to_ica(deps, env, info)
        }
        ExecuteMsg::FundCommunityPool {} => execute_fund_community_pool(deps, env),
        ExecuteMsg::Done {} => execute_done(),
    }
}

fn execute_claim_unclaimed(
    deps: DepsMut<NeutronQuery>,
    _env: Env,
) -> NeutronResult<Response<NeutronMsg>> {
    STAGE.save(deps.storage, &ExecuteMsg::CreateHubICA {})?;

    // let before_amount = deps.querier.query_balance(env.contract.address, NEUTRON_DENOM)?;

    let config = CONFIG.load(deps.storage)?;

    // Generate burn submessage and return a response
    let claim_message = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: config.airdrop_address.to_string(),
        msg: to_binary(&cw20_merkle_airdrop::ExecuteMsg::WithdrawAll {})?,
        funds: vec![],
    });

    Ok(Response::default().add_message(claim_message))
}

fn execute_create_hub_ica(
    deps: DepsMut<NeutronQuery>,
    _env: Env,
) -> NeutronResult<Response<NeutronMsg>> {
    STAGE.save(deps.storage, &ExecuteMsg::SendClaimedTokensToICA {})?;

    let config = CONFIG.load(deps.storage)?;

    let register_ica =
        NeutronMsg::register_interchain_account(config.connection_id, config.interchain_account_id);

    INTERCHAIN_ACCOUNT.save(deps.storage, &None)?;
    Ok(Response::default().add_message(register_ica))
}

fn execute_send_claimed_tokens_to_ica(
    deps: DepsMut<NeutronQuery>,
    env: Env,
    info: MessageInfo,
) -> NeutronResult<Response<NeutronMsg>> {
    STAGE.save(deps.storage, &ExecuteMsg::FundCommunityPool {})?;

    let config = CONFIG.load(deps.storage)?;
    let ica = INTERCHAIN_ACCOUNT.load(deps.storage)?.ok_or_else(|| {
        NeutronError::Std(StdError::generic_err("no ica created yet".to_string()))
    })?;
    let neutron_on_balance = deps
        .querier
        .query_balance(env.contract.address.clone(), NEUTRON_DENOM)?;

    let fee_funds = info
        .funds
        .iter()
        .find(|c| c.denom == NEUTRON_DENOM)
        .ok_or_else(|| {
            NeutronError::Std(StdError::generic_err(
                "please send funds as a fee".to_string(),
            ))
        })?
        .clone();

    let neutron_to_send = Coin::new(
        (neutron_on_balance.amount - fee_funds.amount).u128(),
        NEUTRON_DENOM,
    );
    let ack_fee = fee_funds.amount / Uint128::new(2) + fee_funds.amount % Uint128::new(2);
    let timeout_fee = fee_funds.amount / Uint128::new(2);
    if ack_fee + timeout_fee != fee_funds.amount {
        return Err(NeutronError::Std(StdError::generic_err(format!(
            "incorrect total fee calculated: {:?}",
            ack_fee + timeout_fee
        ))));
    }

    let fee = IbcFee {
        recv_fee: vec![Coin::new(0, NEUTRON_DENOM)],
        ack_fee: vec![Coin {
            amount: ack_fee,
            denom: NEUTRON_DENOM.to_string(),
        }],
        timeout_fee: vec![Coin {
            amount: timeout_fee,
            denom: NEUTRON_DENOM.to_string(),
        }],
    };

    TRANSFER_AMOUNT.save(deps.storage, &neutron_to_send.amount)?;

    let send_msg = NeutronMsg::IbcTransfer {
        source_port: TRANSFER_PORT.to_string(),
        source_channel: config.channel_id_to_hub.to_string(),
        sender: env.contract.address.to_string(),
        receiver: ica.address,
        token: neutron_to_send,
        timeout_height: RequestPacketTimeoutHeight {
            revision_number: None,
            revision_height: None,
        },
        timeout_timestamp: env.block.time.plus_seconds(600).nanos(),
        memo: "transfer unclaimed airdrop to Cosmos Hub".to_string(),
        fee,
    };

    Ok(Response::default().add_message(send_msg))
}

fn execute_fund_community_pool(
    deps: DepsMut<NeutronQuery>,
    _env: Env,
) -> NeutronResult<Response<NeutronMsg>> {
    STAGE.save(deps.storage, &ExecuteMsg::Done {})?;
    let config = CONFIG.load(deps.storage)?;
    let ica = INTERCHAIN_ACCOUNT.load(deps.storage)?.ok_or_else(|| {
        NeutronError::Std(StdError::generic_err("no ica address yet".to_string()))
    })?;

    let amount = CosmosCoin {
        denom: config.ibc_neutron_denom.to_string(),
        amount: TRANSFER_AMOUNT.load(deps.storage)?.to_string(),
    };

    let ica_msg = MsgFundCommunityPool {
        amount: vec![amount],
        depositor: ica.address.to_string(),
    };

    let mut buf = Vec::new();
    buf.reserve(Message::encoded_len(&ica_msg));

    if let Err(e) = Message::encode(&ica_msg, &mut buf) {
        return Err(NeutronError::Std(StdError::generic_err(format!(
            "Encode error: {}",
            e
        ))));
    }

    let any_msg = ProtobufAny {
        type_url: "/cosmos.distribution.v1beta1.MsgFundCommunityPool".to_string(),
        value: Binary::from(buf),
    };

    let fee = min_ntrn_ibc_fee(deps.as_ref())?;
    let cosmos_msg = NeutronMsg::submit_tx(
        config.connection_id,
        config.interchain_account_id.clone(),
        vec![any_msg],
        "fund community pool from neutron unclaimed airdrop".to_string(),
        DEFAULT_TIMEOUT_HEIGHT,
        fee,
    );

    Ok(Response::default().add_message(cosmos_msg))
}

fn execute_done() -> NeutronResult<Response<NeutronMsg>> {
    Err(NeutronError::Std(StdError::generic_err(
        "cannot execute, sending is already done",
    )))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Stage {} => query_stage(deps),
        QueryMsg::InterchainAccount {} => query_interchain_account(deps),
        QueryMsg::TransferAmount {} => query_transfer_amount(deps),
    }
}

fn query_transfer_amount(deps: Deps) -> StdResult<Binary> {
    let amount = TRANSFER_AMOUNT.load(deps.storage)?;
    to_binary(&amount)
}

fn query_interchain_account(deps: Deps) -> StdResult<Binary> {
    let ica = INTERCHAIN_ACCOUNT.load(deps.storage)?;
    to_binary(&ica)
}

fn query_stage(deps: Deps) -> StdResult<Binary> {
    let stage = STAGE.load(deps.storage)?;
    to_binary(&stage)
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(deps: DepsMut, _env: Env, _msg: MigrateMsg) -> StdResult<Response> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    Ok(Response::default())
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn sudo(deps: DepsMut, env: Env, msg: SudoMsg) -> StdResult<Response> {
    match msg {
        SudoMsg::OpenAck {
            port_id,
            channel_id,
            counterparty_channel_id,
            counterparty_version,
        } => sudo_open_ack(
            deps,
            env,
            port_id,
            channel_id,
            counterparty_channel_id,
            counterparty_version,
        ),
        SudoMsg::Error { request, details } => sudo_error(deps, request, details),
        SudoMsg::Timeout { request } => sudo_timeout(deps, request),
        _ => Ok(Response::default()),
    }
}

fn sudo_error(deps: DepsMut, _request: RequestPacket, _details: String) -> StdResult<Response> {
    let current_stage = STAGE.load(deps.storage)?;
    let stage = previous_stage(current_stage)?;
    STAGE.save(deps.storage, &stage)?;

    Ok(Response::default())
}

fn sudo_timeout(deps: DepsMut, _request: RequestPacket) -> StdResult<Response> {
    let current_stage = STAGE.load(deps.storage)?;
    let stage = previous_stage(current_stage)?;
    STAGE.save(deps.storage, &stage)?;

    Ok(Response::default())
}

fn sudo_open_ack(
    deps: DepsMut,
    _env: Env,
    port_id: String,
    _channel_id: String,
    _counterparty_channel_id: String,
    counterparty_version: String,
) -> StdResult<Response> {
    let parsed_version: Result<OpenAckVersion, _> =
        serde_json_wasm::from_str(counterparty_version.as_str());
    if let Ok(parsed_version) = parsed_version {
        INTERCHAIN_ACCOUNT.save(
            deps.storage,
            &Some(InterchainAccount {
                port_id,
                address: parsed_version.address,
                controller_connection_id: parsed_version.controller_connection_id,
            }),
        )?;
        return Ok(Response::default());
    }
    Err(StdError::generic_err("Can't parse counterparty_version"))
}

#[cfg(test)]
mod tests {}

fn min_ntrn_ibc_fee(deps: Deps<NeutronQuery>) -> NeutronResult<IbcFee> {
    let fee = query_min_ibc_fee(deps)?.min_fee;
    Ok(IbcFee {
        recv_fee: fee.recv_fee,
        ack_fee: fee
            .ack_fee
            .into_iter()
            .filter(|a| a.denom == NEUTRON_DENOM)
            .collect(),
        timeout_fee: fee
            .timeout_fee
            .into_iter()
            .filter(|a| a.denom == NEUTRON_DENOM)
            .collect(),
    })
}

fn previous_stage(stage: ExecuteMsg) -> StdResult<ExecuteMsg> {
    let stages = [
        ExecuteMsg::ClaimUnclaimed {},
        ExecuteMsg::CreateHubICA {},
        ExecuteMsg::SendClaimedTokensToICA {},
        ExecuteMsg::FundCommunityPool {},
        ExecuteMsg::Done {},
    ];
    let i = stages
        .iter()
        .position(|s| *s == stage)
        .ok_or_else(|| StdError::generic_err(format!("Incorrect stage: {:?}", stage)))?;

    if i == 0 {
        return Err(StdError::generic_err(
            "no previous stage for the first stage",
        ));
    }

    Ok(stages[i - 1].clone())
}
