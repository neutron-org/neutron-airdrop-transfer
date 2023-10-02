pub mod cw20_merkle_airdrop {
    use cosmwasm_schema::cw_serde;

    #[cw_serde]
    pub enum ExecuteMsg {
        /// Permissionless, activated after vesting is over (consult to `[InstantiateMsg]`
        /// documentation for more info). Withdraws all remaining cNTRN tokens, burns them,
        /// receiving NTRN in exchange, and sends all received NTRN's to reserve.
        WithdrawAll {},
    }
}
