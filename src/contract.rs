#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{Binary, Coin, CosmosMsg, Deps, DepsMut, Env, MessageInfo, Response, StdError, StdResult, SubMsg, to_binary, WasmMsg};
use cw2::set_contract_version;
use serde_json_wasm;
use cosmos_sdk_proto::cosmos::bank::v1beta1::MsgSend as ICAMsgSend;
use prost::Message;
use cosmos_sdk_proto::cosmos::base::v1beta1::Coin as CosmosCoin;

use neutron_sdk::{NeutronError, NeutronResult};
use neutron_sdk::bindings::msg::{IbcFee, NeutronMsg};
use neutron_sdk::bindings::query::NeutronQuery;
use neutron_sdk::sudo::msg::{RequestPacketTimeoutHeight, SudoMsg};
use neutron_sdk::query::min_ibc_fee::query_min_ibc_fee;

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, MigrateMsg, QueryMsg};
use crate::outer::cw20_merkle_airdrop;
use crate::state::{CONFIG, Config, INTERCHAIN_ACCOUNT, InterchainAccount, OpenAckVersion, STAGE};

// version info for migration info
const CONTRACT_NAME: &str = "crates.io:neutron-airdrop-transfer";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

// Default timeout for IbcTransfer is 10000000 blocks
const DEFAULT_TIMEOUT_HEIGHT: u64 = 10000000;
const NEUTRON_DENOM: &str = "untrn";

const IBC_TRANSFER_MEMO: &str = "transfer unclaimed airdrop to Cosmos Hub";

const SEND_TOKENS_TO_COMMUNITY_POOL_ID: u64 = 1;

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    STAGE.save(deps.storage, &ExecuteMsg::ClaimUnclaimed {})?;
    CONFIG.save(deps.storage, &Config {
        connection_id: msg.connection_id,
        airdrop_address: deps.api.addr_validate(&msg.airdrop_address)?,
        interchain_account_id: msg.interchain_account_id,
        cosmoshub_channel: msg.cosmoshub_channel,
        cosmoshub_community_pool_address: msg.cosmoshub_community_pool_address,
        ibc_neutron_denom: msg.ibc_neutron_denom,
    })?;
    Ok(Response::default())
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut<NeutronQuery>,
    env: Env,
    _info: MessageInfo,
    msg: ExecuteMsg,
) -> NeutronResult<Response<NeutronMsg>>{
    let current_stage = STAGE.load(deps.storage)?;
    if current_stage != msg {
        // TODO: save what stage should be in the error
        // return Err(NeutronError::Std(ContractError::IncorrectStage {}));
        return Err(NeutronError::Std(StdError::generic_err("incorrect stage")))
    }

    match msg {
        ExecuteMsg::ClaimUnclaimed {} => execute_claim_unclaimed(deps, env),
        ExecuteMsg::CreateHubICA {} => execute_create_hub_ica(deps, env),
        ExecuteMsg::SendClaimedTokensToICA {} => send_claimed_tokens_to_ica(deps, env),
        ExecuteMsg::SendTokensToCommunityPool {} => send_tokens_to_community_pool(deps, env),
        ExecuteMsg::Done {} => execute_done(),
    }
}

fn execute_claim_unclaimed(deps: DepsMut<NeutronQuery>, env: Env) -> NeutronResult<Response<NeutronMsg>> {
    STAGE.save(deps.storage, &ExecuteMsg::CreateHubICA {})?;

    let config = CONFIG.load(deps.storage)?;

    // Generate burn submessage and return a response
    let claim_message = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: config.airdrop_address.to_string(),
        msg: to_binary(&cw20_merkle_airdrop::ExecuteMsg::WithdrawAll {})?,
        funds: vec![],
    });

    Ok(Response::default().add_message(claim_message))
}

fn execute_create_hub_ica(deps: DepsMut<NeutronQuery>, env: Env) -> NeutronResult<Response<NeutronMsg>> {
    STAGE.save(deps.storage, &ExecuteMsg::SendClaimedTokensToICA {})?;

    let config = CONFIG.load(deps.storage)?;

    let register_ica = NeutronMsg::register_interchain_account(
        config.connection_id,
        config.interchain_account_id,
    );
    // let key = get_port_id(env.contract.address.as_str(), &interchain_account_id);
    // we are saving empty data here because we handle response of registering ICA in sudo_open_ack method
    INTERCHAIN_ACCOUNT.save(deps.storage, &None)?;
    Ok(Response::default().add_message(register_ica))
}

fn send_claimed_tokens_to_ica(deps: DepsMut<NeutronQuery>, env: Env) -> NeutronResult<Response<NeutronMsg>> {
    STAGE.save(deps.storage, &ExecuteMsg::SendTokensToCommunityPool {})?;

    let config = CONFIG.load(deps.storage)?;
    let ica = INTERCHAIN_ACCOUNT
        .load(deps.storage)?
        .ok_or_else(|| NeutronError::Std(StdError::generic_err("no ica address yet".to_string())))?;
    let token = deps.querier.query_balance(env.contract.address.clone(), NEUTRON_DENOM)?;

    let send_msg = NeutronMsg::IbcTransfer {
        source_port: "transfer".to_string(),
        source_channel: config.cosmoshub_channel.to_string(),
        sender: env.contract.address.to_string(),
        receiver: ica.address,
        token,
        timeout_height: RequestPacketTimeoutHeight {
            revision_number: Some(4), // TODO: revision number
            revision_height: Some(DEFAULT_TIMEOUT_HEIGHT),
        },
        timeout_timestamp: 0,
        memo: IBC_TRANSFER_MEMO.to_string(),
        fee:  min_ntrn_ibc_fee(deps.as_ref())?,
    };

    Ok(Response::default().add_message(send_msg))
}

fn send_tokens_to_community_pool(deps: DepsMut<NeutronQuery>, env: Env) -> NeutronResult<Response<NeutronMsg>> {
    STAGE.save(deps.storage, &ExecuteMsg::Done {})?;
    let config = CONFIG.load(deps.storage)?;
    let ica = INTERCHAIN_ACCOUNT.load(deps.storage)?
        .ok_or_else(|| NeutronError::Std(StdError::generic_err("no ica address yet".to_string())))?;

    let ibc_denom = "TODO";
    let amount = CosmosCoin{
        denom: ibc_denom.to_string(),
        amount: TODO-amount.to_string(),
    };

    let ica_msg = ICAMsgSend{
        from_address: ica.address.to_string(),
        to_address: config.cosmoshub_community_pool_address.to_string(),
        amount: vec![amount],
    };

    let mut buf = Vec::new();
    buf.reserve(Message::encoded_len(&ica_msg));

    if let Err(e) = Message::encode(&ica_msg, &mut buf) {
        return Err(NeutronError::Std(StdError::generic_err(format!("Encode error: {}", e))));
    }

    let any_msg = ProtobufAny {
        type_url: "/cosmos.bank TODO".to_string(), // TODO
        value: Binary::from(buf),
    };

    let fee = min_ntrn_ibc_fee(deps.as_ref())?;
    let cosmos_msg = NeutronMsg::submit_tx(
        config.connection_id,
        config.interchain_account_id.clone(),
        vec![any_msg],
        "TODO: memo2".to_string(),
        DEFAULT_TIMEOUT_HEIGHT,
        fee, // TODO: check
    );

    let submsg = SubMsg::reply_on_success(cosmos_msg, SEND_TOKENS_TO_COMMUNITY_POOL_ID);
    // todo: reply handler? don't know if needed

    Ok(Response::default().add_submessage(submsg))
}

fn execute_done() -> NeutronResult<Response<NeutronMsg>> {
    Err(NeutronError::Std(StdError::generic_err(
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
        _ => Ok(Response::default()),
    }
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
            &Some(InterchainAccount{
                    port_id,
                    address: parsed_version.address,
                    controller_connection_id: parsed_version.controller_connection_id,
                })
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
