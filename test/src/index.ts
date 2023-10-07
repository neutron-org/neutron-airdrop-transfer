#!/usr/bin/env node
import { program } from 'commander';
import { SetupContracts } from "./setup";
import {Connect} from "./connector";
import {Step1} from "./step_1";
import {Step2} from "./step_2";
import {Step3} from "./step_3";
import {Step4} from "./step_4";

if (require.main === module) {
    program
        .name('setup_contracts')
        .command('setup_contracts')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .action(async (wallet, endpoint) => {
            const connection = await Connect(wallet, endpoint)
            await SetupContracts(connection);
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
