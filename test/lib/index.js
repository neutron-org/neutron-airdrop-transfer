#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const setup_1 = require("./setup");
const connector_1 = require("./connector");
const step_1_1 = require("./step_1");
const step_2_1 = require("./step_2");
const step_3_1 = require("./step_3");
const step_4_1 = require("./step_4");
if (require.main === module) {
    commander_1.program
        .name('setup_contracts')
        .command('setup_contracts')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .argument('<connection_id>', 'connection id to hub')
        .argument('<channel_id>', 'channel id to hub')
        .argument('<ibc_neutron_denom>', 'ibc of untrn sent to cosmos over `channel_id`')
        .argument('<hub_revision_number>', 'hub revision number')
        .action(async (wallet, endpoint, connectionId, channelId, ibcNeutronDenom, hubRevisionNumber) => {
        const connection = await (0, connector_1.Connect)(wallet, endpoint);
        await (0, setup_1.SetupContracts)(connection, connectionId, channelId, ibcNeutronDenom, hubRevisionNumber);
        console.log('🥳 Done');
    });
    commander_1.program
        .name('step_1')
        .command('step_1')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .argument('<claimer_address>', 'claimer contract address')
        .action(async (wallet, endpoint, claimerAddress) => {
        const connection = await (0, connector_1.Connect)(wallet, endpoint);
        await (0, step_1_1.Step1)(connection, claimerAddress);
        console.log('🥳 Done');
    });
    commander_1.program
        .name('step_2')
        .command('step_2')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .argument('<claimer_address>', 'claimer contract address')
        .action(async (wallet, endpoint, claimerAddress) => {
        const connection = await (0, connector_1.Connect)(wallet, endpoint);
        await (0, step_2_1.Step2)(connection, claimerAddress);
        console.log('🥳 Done');
    });
    commander_1.program
        .name('step_3')
        .command('step_3')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .argument('<claimer_address>', 'claimer contract address')
        .action(async (wallet, endpoint, claimerAddress) => {
        const connection = await (0, connector_1.Connect)(wallet, endpoint);
        await (0, step_3_1.Step3)(connection, claimerAddress);
        console.log('🥳 Done');
    });
    commander_1.program
        .name('step_4')
        .command('step_4')
        .argument('<wallet>', 'wallet mnemonic')
        .argument('<endpoint>', 'rpc endpoint')
        .argument('<claimer_address>', 'claimer contract address')
        .action(async (wallet, endpoint, claimerAddress) => {
        const connection = await (0, connector_1.Connect)(wallet, endpoint);
        await (0, step_4_1.Step4)(connection, claimerAddress);
        console.log('🥳 Done');
    });
    commander_1.program.parse();
}
