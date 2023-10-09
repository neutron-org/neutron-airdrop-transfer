#!/usr/bin/env node
import { program } from 'commander';
import { SetupContracts } from "./setup";
import { Connect } from "./connector";
import { Step1 } from "./step_1";
import { Step2 } from "./step_2";
import { Step3 } from "./step_3";
import { Step4 } from "./step_4";

if (require.main === module) {
    program
        .name('query_state')
        .command('query_state')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .argument('<claimer_address>', 'claimer contract address')
        .action(async (wallet, endpoint, claimerAddress) => {
            const connection = await Connect(wallet, endpoint)

            try { console.log('ICA address: ' + JSON.stringify(await connection.client.queryContractSmart(claimerAddress, { interchain_account: {} }))) }
            catch { console.log('No ica account') }
            console.log('Stage: ' + JSON.stringify(await connection.client.queryContractSmart(claimerAddress, { stage: {} })))
            try { console.log('TransferAmount: ' + await connection.client.queryContractSmart(claimerAddress, { transfer_amount: {} })) }
            catch { console.log('No transfer amount')}
            console.log('Contract balance: ' +  JSON.stringify(await connection.client.getBalance(claimerAddress, 'untrn')))
        });

    program
        .name('setup_contracts')
        .command('setup_contracts')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .argument('<connection_id>', 'connection id to hub')
        .argument('<channel_id>', 'channel id to hub')
        .argument('<ibc_neutron_denom>', 'ibc of untrn sent to cosmos over `channel_id`')
        .action(async (wallet, endpoint, connectionId, channelId, ibcNeutronDenom) => {
            const connection = await Connect(wallet, endpoint)
            await SetupContracts(connection, connectionId, channelId, ibcNeutronDenom);
            console.log('🥳 Done');
        });

    program
        .name('step_1')
        .command('step_1')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .argument('<claimer_address>', 'claimer contract address')
        .action(async (wallet, endpoint, claimerAddress) => {
            const connection = await Connect(wallet, endpoint)
            await Step1(connection, claimerAddress);
            console.log('🥳 Done');
        });

    program
        .name('step_2')
        .command('step_2')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .argument('<claimer_address>', 'claimer contract address')
        .action(async (wallet, endpoint, claimerAddress) => {
            const connection = await Connect(wallet, endpoint)
            await Step2(connection, claimerAddress);
            console.log('🥳 Done');
        });

    program
        .name('step_3')
        .command('step_3')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .argument('<claimer_address>', 'claimer contract address')
        .action(async (wallet, endpoint, claimerAddress) => {
            const connection = await Connect(wallet, endpoint)
            await Step3(connection, claimerAddress);
            console.log('🥳 Done');
        });

    program
        .name('step_4')
        .command('step_4')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .argument('<claimer_address>', 'claimer contract address')
        .action(async (wallet, endpoint, claimerAddress) => {
            const connection = await Connect(wallet, endpoint)
            await Step4(connection, claimerAddress);
            console.log('🥳 Done');
        });

    program.parse();
}
