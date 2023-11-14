use cosmos_sdk_proto::cosmos::base::v1beta1::Coin as CosmosCoin;
use cosmos_sdk_proto::cosmos::distribution::v1beta1::MsgFundCommunityPool;
#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{
    to_binary, Binary, Coin, Deps, DepsMut, Env, MessageInfo, Response, StdError, StdResult,
    Storage, Uint128,
};
use cw2::set_contract_version;
use prost::Message;
use serde_json_wasm;

use neutron_sdk::bindings::msg::{IbcFee, NeutronMsg};
use neutron_sdk::bindings::query::NeutronQuery;
use neutron_sdk::bindings::types::ProtobufAny;
use neutron_sdk::sudo::msg::{RequestPacket, RequestPacketTimeoutHeight, SudoMsg};
use neutron_sdk::{NeutronError, NeutronResult};
use serde_json_wasm::de::Error;

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, MigrateMsg, QueryMsg};
use crate::state::{
    Config, IbcCallbackState, InterchainAccount, OpenAckVersion, CONFIG, IBC_CALLBACK_STATES,
    INTERCHAIN_ACCOUNT,
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

    CONFIG.save(
        deps.storage,
        &Config {
            connection_id: msg.connection_id,
            transfer_channel_id: msg.transfer_channel_id,
            ibc_neutron_denom: msg.ibc_neutron_denom,
            ibc_timeout_seconds: msg.ibc_timeout_seconds,
        },
    )?;
    INTERCHAIN_ACCOUNT.save(deps.storage, &None)?;
    IBC_CALLBACK_STATES.save(deps.storage, &vec![])?;

    Ok(Response::default())
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut<NeutronQuery>,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> NeutronResult<Response<NeutronMsg>> {
    match msg {
        ExecuteMsg::CreateHubICA {} => execute_create_hub_ica(deps, env, info),
        ExecuteMsg::SendClaimedTokensToICA {} => {
            execute_send_claimed_tokens_to_ica(deps, env, info)
        }
        ExecuteMsg::FundCommunityPool { amount } => {
            execute_fund_community_pool(deps, env, info, amount)
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

    let config = CONFIG.load(deps.storage)?;
    let register_ica =
        NeutronMsg::register_interchain_account(config.connection_id, ICA_ID.to_string());

    Ok(Response::default().add_message(register_ica))
}

fn execute_send_claimed_tokens_to_ica(
    deps: DepsMut<NeutronQuery>,
    env: Env,
    info: MessageInfo,
) -> NeutronResult<Response<NeutronMsg>> {
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
    let neutron_amount_to_send = neutron_on_balance.amount - fee_funds.amount;
    if neutron_amount_to_send.is_zero() {
        return Err(NeutronError::Std(StdError::generic_err(
            "zero neutron to send".to_string(),
        )));
    }
    let neutron_to_send = Coin::new(neutron_amount_to_send.u128(), NEUTRON_DENOM);

    let send_msg = NeutronMsg::IbcTransfer {
        source_port: TRANSFER_PORT.to_string(),
        source_channel: config.transfer_channel_id,
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
            .plus_seconds(config.ibc_timeout_seconds)
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
    amount: Uint128,
) -> NeutronResult<Response<NeutronMsg>> {
    let config = CONFIG.load(deps.storage)?;
    let ica = INTERCHAIN_ACCOUNT.load(deps.storage)?.ok_or_else(|| {
        NeutronError::Std(StdError::generic_err(
            "ica is not created or open".to_string(),
        ))
    })?;

    let coin = CosmosCoin {
        denom: config.ibc_neutron_denom.to_string(),
        amount: amount.to_string(),
    };

    let ica_msg = MsgFundCommunityPool {
        amount: vec![coin],
        depositor: ica.address,
    };

    let any_msg = {
        let mut buf = Vec::new();
        buf.reserve(Message::encoded_len(&ica_msg));

        if let Err(e) = Message::encode(&ica_msg, &mut buf) {
            return Err(NeutronError::Std(StdError::generic_err(format!(
                "Encode error: {}",
                e
            ))));
        }

        ProtobufAny {
            type_url: MSG_FUND_COMMUNITY_POOL.to_string(),
            value: Binary::from(buf),
        }
    };

    let (_, fee) = ibc_fee_from_funds(&info)?;
    let cosmos_msg = NeutronMsg::submit_tx(
        config.connection_id,
        ICA_ID.to_string(),
        vec![any_msg],
        FUND_COMMUNITY_POOL_MEMO.to_string(),
        config.ibc_timeout_seconds,
        fee,
    );

    Ok(Response::default().add_message(cosmos_msg))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::InterchainAccount {} => query_interchain_account(deps),
        QueryMsg::IbcCallbackStates {} => query_ibc_callback_states(deps),
    }
}

fn query_interchain_account(deps: Deps) -> StdResult<Binary> {
    let ica = INTERCHAIN_ACCOUNT.load(deps.storage)?;
    to_binary(&ica)
}

fn query_ibc_callback_states(deps: Deps) -> StdResult<Binary> {
    let states = IBC_CALLBACK_STATES.load(deps.storage)?;
    to_binary(&states)
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
        SudoMsg::Response { request, data } => sudo_response(deps, env, request, data),
        SudoMsg::Error { request, details } => sudo_error(deps, env, request, details),
        SudoMsg::Timeout { request } => sudo_timeout(deps, env, request),
        _ => Ok(Response::default()),
    }
}

fn sudo_response(
    deps: DepsMut,
    env: Env,
    request: RequestPacket,
    _data: Binary,
) -> StdResult<Response> {
    save_ibc_callback_state(
        deps.storage,
        IbcCallbackState::Response(request, env.block.height),
    )?;

    Ok(Response::default())
}

fn sudo_error(
    deps: DepsMut,
    env: Env,
    request: RequestPacket,
    details: String,
) -> StdResult<Response> {
    save_ibc_callback_state(
        deps.storage,
        IbcCallbackState::Error(request, details, env.block.height),
    )?;

    Ok(Response::default())
}

// can be called by response of create ica, ibc transfer and fund community pool
fn sudo_timeout(deps: DepsMut, env: Env, request: RequestPacket) -> StdResult<Response> {
    // save into callback state and cleanup ICA
    let source_port = request
        .source_port
        .clone()
        .ok_or_else(|| StdError::generic_err("source_port not found"))?;

    save_ibc_callback_state(
        deps.storage,
        IbcCallbackState::Timeout(request, env.block.height),
    )?;

    // ICA transactions timeout closes the channel
    if let Some(ica) = INTERCHAIN_ACCOUNT.load(deps.storage)? {
        if source_port == ica.port_id {
            INTERCHAIN_ACCOUNT.save(deps.storage, &None)?;
        }
    }

    Ok(Response::default())
}

fn sudo_open_ack(
    deps: DepsMut,
    env: Env,
    port_id: String,
    channel_id: String,
    counterparty_channel_id: String,
    counterparty_version: String,
) -> StdResult<Response> {
    let parsed_version: Result<OpenAckVersion, Error> =
        serde_json_wasm::from_str(counterparty_version.as_str());

    match parsed_version {
        Ok(version) => {
            INTERCHAIN_ACCOUNT.save(
                deps.storage,
                &Some(InterchainAccount {
                    address: version.address,
                    port_id,
                    channel_id,
                    counterparty_channel_id,
                }),
            )?;
        }
        Err(e) => {
            save_ibc_callback_state(
                deps.storage,
                IbcCallbackState::OpenAckError(
                    e.to_string(),
                    env.block.height,
                    port_id,
                    channel_id,
                    counterparty_channel_id,
                    counterparty_version,
                ),
            )?;
        }
    }

    Ok(Response::default())
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

fn save_ibc_callback_state(
    storage: &mut dyn Storage,
    callback_state: IbcCallbackState,
) -> StdResult<()> {
    IBC_CALLBACK_STATES.update::<_, StdError>(storage, |mut list| {
        list.push(callback_state);
        Ok(list)
    })?;

    Ok(())
}

// this is only for testing purposes
#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(deps: DepsMut, _env: Env, msg: MigrateMsg) -> StdResult<Response> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let new_config = {
        let mut config = CONFIG.load(deps.storage)?;
        if let Some(ibc_timeout_seconds) = msg.ibc_timeout_seconds {
            config.ibc_timeout_seconds = ibc_timeout_seconds;
        }
        config
    };
    CONFIG.save(deps.storage, &new_config)?;

    if let Some(mut ica) = INTERCHAIN_ACCOUNT.load(deps.storage)? {
        if let Some(address) = msg.ica_address {
            ica.address = address;
            INTERCHAIN_ACCOUNT.save(deps.storage, &Some(ica))?;
        }
    }

    Ok(Response::default())
}
