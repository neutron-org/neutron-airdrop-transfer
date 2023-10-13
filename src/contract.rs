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
use neutron_sdk::interchain_txs::helpers::decode_acknowledgement_response;
use neutron_sdk::sudo::msg::{RequestPacket, RequestPacketTimeoutHeight, SudoMsg};
use neutron_sdk::{NeutronError, NeutronResult};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, MigrateMsg, QueryMsg};
use crate::outer::cw20_merkle_airdrop;
use crate::state::{
    Config, InterchainAccount, OpenAckVersion, Stage, CONFIG, INTERCHAIN_ACCOUNT,
    INTERCHAIN_TX_IN_PROGRESS, STAGE, TRANSFER_AMOUNT,
};

const ICA_ID: &str = "funder";

// version info for migration info
const CONTRACT_NAME: &str = "crates.io:neutron-airdrop-transfer";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

const NEUTRON_DENOM: &str = "untrn";

const TRANSFER_PORT: &str = "transfer";

const MSG_FUND_COMMUNITY_POOL: &str = "/cosmos.distribution.v1beta1.MsgFundCommunityPool";

const SEND_TO_ICA_MEMO: &str = "transfer unclaimed airdrop to Cosmos Hub";
const FUND_COMMUNITY_POOL_MEMO: &str = "fund community pool from neutron unclaimed airdrop";

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    STAGE.save(deps.storage, &Stage::ClaimUnclaimed {})?;
    CONFIG.save(
        deps.storage,
        &Config {
            connection_id: msg.connection_id,
            airdrop_address: deps.api.addr_validate(&msg.airdrop_address)?,
            channel_id_to_hub: msg.channel_id_to_hub,
            ibc_neutron_denom: msg.ibc_neutron_denom,
            transfer_timeout_seconds: msg.transfer_timeout_seconds,
            ica_timeout_seconds: msg.ica_timeout_seconds,
        },
    )?;
    INTERCHAIN_ACCOUNT.save(deps.storage, &None)?;
    INTERCHAIN_TX_IN_PROGRESS.save(deps.storage, &false)?;

    Ok(Response::default())
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut<NeutronQuery>,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> NeutronResult<Response<NeutronMsg>> {
    if INTERCHAIN_TX_IN_PROGRESS.load(deps.storage)? {
        return Err(NeutronError::Std(StdError::generic_err(
            "interchain transaction is in progress",
        )));
    }

    let current_stage = STAGE.load(deps.storage)?;

    match msg {
        ExecuteMsg::CreateHubICA {} => execute_create_hub_ica(deps, env, info),
        ExecuteMsg::ClaimUnclaimed {} => execute_claim_unclaimed(deps, env, info, current_stage),
        ExecuteMsg::SendClaimedTokensToICA {} => {
            execute_send_claimed_tokens_to_ica(deps, env, info, current_stage)
        }
        ExecuteMsg::FundCommunityPool {} => {
            execute_fund_community_pool(deps, env, info, current_stage)
        }
    }
}

fn execute_create_hub_ica(
    deps: DepsMut<NeutronQuery>,
    _env: Env,
    _info: MessageInfo,
) -> NeutronResult<Response<NeutronMsg>> {
    // return if ICA channel exists and opened
    if INTERCHAIN_ACCOUNT.load(deps.storage)?.is_some() {
        return Err(NeutronError::Std(StdError::generic_err(
            "ICA channel already exists and open",
        )));
    }

    INTERCHAIN_TX_IN_PROGRESS.save(deps.storage, &true)?;

    let config = CONFIG.load(deps.storage)?;
    let register_ica =
        NeutronMsg::register_interchain_account(config.connection_id, ICA_ID.to_string());

    Ok(Response::default().add_message(register_ica))
}

fn execute_claim_unclaimed(
    deps: DepsMut<NeutronQuery>,
    _env: Env,
    _info: MessageInfo,
    current_stage: Stage,
) -> NeutronResult<Response<NeutronMsg>> {
    if current_stage != Stage::ClaimUnclaimed {
        return Err(NeutronError::Std(StdError::generic_err(format!(
            "incorrect stage: {:?}",
            current_stage
        ))));
    }
    STAGE.save(deps.storage, &Stage::SendClaimedTokensToICA {})?;

    let config = CONFIG.load(deps.storage)?;

    // Generate burn submessage and return a response
    let claim_message = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: config.airdrop_address.to_string(),
        msg: to_binary(&cw20_merkle_airdrop::ExecuteMsg::WithdrawAll {})?,
        funds: vec![],
    });

    Ok(Response::default().add_message(claim_message))
}

fn execute_send_claimed_tokens_to_ica(
    deps: DepsMut<NeutronQuery>,
    env: Env,
    info: MessageInfo,
    current_stage: Stage,
) -> NeutronResult<Response<NeutronMsg>> {
    if current_stage != Stage::SendClaimedTokensToICA {
        return Err(NeutronError::Std(StdError::generic_err(format!(
            "incorrect stage: {:?}",
            current_stage
        ))));
    }
    INTERCHAIN_TX_IN_PROGRESS.save(deps.storage, &true)?;

    let config = CONFIG.load(deps.storage)?;
    let ica = INTERCHAIN_ACCOUNT.load(deps.storage)?.ok_or_else(|| {
        NeutronError::Std(StdError::generic_err(
            "ica is not created or open".to_string(),
        ))
    })?;
    let neutron_on_balance = deps
        .querier
        .query_balance(env.contract.address.clone(), NEUTRON_DENOM)?;

    let (fee_funds, fee) = ibc_fee_from_funds(&info)?;
    let neutron_to_send = Coin::new(
        (neutron_on_balance.amount - fee_funds.amount).u128(),
        NEUTRON_DENOM,
    );
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
        timeout_timestamp: env
            .block
            .time
            .plus_seconds(config.transfer_timeout_seconds)
            .nanos(),
        memo: SEND_TO_ICA_MEMO.to_string(),
        fee,
    };

    Ok(Response::default().add_message(send_msg))
}

fn execute_fund_community_pool(
    deps: DepsMut<NeutronQuery>,
    _env: Env,
    info: MessageInfo,
    current_stage: Stage,
) -> NeutronResult<Response<NeutronMsg>> {
    if current_stage != Stage::FundCommunityPool {
        return Err(NeutronError::Std(StdError::generic_err(format!(
            "incorrect stage: {:?}",
            current_stage
        ))));
    }
    INTERCHAIN_TX_IN_PROGRESS.save(deps.storage, &true)?;
    let config = CONFIG.load(deps.storage)?;
    let ica = INTERCHAIN_ACCOUNT.load(deps.storage)?.ok_or_else(|| {
        NeutronError::Std(StdError::generic_err(
            "ica is not created or open".to_string(),
        ))
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
        type_url: MSG_FUND_COMMUNITY_POOL.to_string(),
        value: Binary::from(buf),
    };

    let (_, fee) = ibc_fee_from_funds(&info)?;
    let cosmos_msg = NeutronMsg::submit_tx(
        config.connection_id,
        ICA_ID.to_string(),
        vec![any_msg],
        FUND_COMMUNITY_POOL_MEMO.to_string(),
        config.ica_timeout_seconds,
        fee,
    );

    Ok(Response::default().add_message(cosmos_msg))
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
pub fn migrate(deps: DepsMut, _env: Env, msg: MigrateMsg) -> StdResult<Response> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let new_config = {
        let mut config = CONFIG.load(deps.storage)?;
        config.transfer_timeout_seconds = msg.transfer_timeout_seconds;
        config.ica_timeout_seconds = msg.ica_timeout_seconds;
        config
    };
    // this is only for testing purposes
    CONFIG.save(deps.storage, &new_config)?;

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
        SudoMsg::Response { request, data } => sudo_response(deps, request, data),
        SudoMsg::Error { request, details } => sudo_error(deps, request, details),
        SudoMsg::Timeout { request } => sudo_timeout(deps, env, request),
        _ => Ok(Response::default()),
    }
}

fn sudo_response(deps: DepsMut, request: RequestPacket, data: Binary) -> StdResult<Response> {
    deps.api.debug("WASMDEBUG: sudo response");
    INTERCHAIN_TX_IN_PROGRESS.save(deps.storage, &false)?;

    let source_port = request
        .source_port
        .ok_or_else(|| StdError::generic_err("source_port not found"))?;
    let is_transfer = source_port == TRANSFER_PORT;
    if is_transfer {
        STAGE.save(deps.storage, &Stage::FundCommunityPool)?;
    } else {
        let parsed_data = decode_acknowledgement_response(data)?;
        for item in parsed_data {
            let item_type = item.msg_type.as_str();
            deps.api
                .debug(&format!("WASMDEBUG: item_type = {}", item_type));
            match item_type {
                MSG_FUND_COMMUNITY_POOL => {
                    STAGE.save(deps.storage, &Stage::Done)?;
                }
                _ => {
                    continue;
                }
            }
        }
    }

    Ok(Response::default())
}

fn sudo_error(deps: DepsMut, _request: RequestPacket, _details: String) -> StdResult<Response> {
    INTERCHAIN_TX_IN_PROGRESS.save(deps.storage, &false)?;

    Ok(Response::default())
}

// can be called by response of create ica, ibc transfer and fund community pool
fn sudo_timeout(deps: DepsMut, _env: Env, request: RequestPacket) -> StdResult<Response> {
    INTERCHAIN_TX_IN_PROGRESS.save(deps.storage, &false)?;

    let source_port = request
        .source_port
        .ok_or_else(|| StdError::generic_err("source_port not found"))?;

    // ICA transactions timeout closes the channel
    if let Some(ica) = INTERCHAIN_ACCOUNT.load(deps.storage)? {
        if source_port == ica.source_port_id {
            INTERCHAIN_ACCOUNT.save(deps.storage, &None)?;
        }
    }

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
                address: parsed_version.address,
                source_port_id: port_id, // TODO: is this the source port_id ?
            }),
        )?;
        STAGE.save(deps.storage, &Stage::SendClaimedTokensToICA)?;
        INTERCHAIN_TX_IN_PROGRESS.save(deps.storage, &false)?;
        return Ok(Response::default());
    }
    Err(StdError::generic_err("Can't parse counterparty_version"))
}

fn ibc_fee_from_funds(info: &MessageInfo) -> NeutronResult<(Coin, IbcFee)> {
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

    let ack_fee = fee_funds.amount / Uint128::new(2);
    let timeout_fee = fee_funds.amount - ack_fee;

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

    Ok((fee_funds, fee))
}
