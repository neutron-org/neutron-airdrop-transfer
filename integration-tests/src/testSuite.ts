import cosmopark, { CosmoparkConfig } from '@neutron-org/cosmopark';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { StargateClient } from '@cosmjs/stargate';
import { Client as NeutronClient } from '@neutron-org/client-ts';

const TIMEOUT = 40 * 1000;

const keys = [
  'master',
  'hermes',
  'ibcrelayer',
  'demowallet1',
  'demo1',
  'demo2',
  'demo3',
] as const;

const networkConfigs = {
  gaia: {
    binary: 'gaiad',
    chain_id: 'testgaia',
    denom: 'stake',
    image: 'gaia-node',
    prefix: 'cosmos',
    validators: 1,
    validators_balance: '1000000000',
    genesis_opts: {
      'app_state.slashing.params.downtime_jail_duration': '10s',
      'app_state.slashing.params.signed_blocks_window': '10',
      'app_state.staking.params.validator_bond_factor': '10',
      // 'app_state.interchainaccounts.host_genesis_state.params.allow_messages': [
      //   '*',
      // ],
    },
    config_opts: {
      'rpc.laddr': 'tcp://0.0.0.0:26657',
    },
    app_opts: {
      'api.enable': true,
      'api.swagger': true,
      'grpc.enable': true,
      'minimum-gas-prices': '0stake',
      'rosetta.enable': true,
    },
  },
  neutron: {
    binary: 'neutrond',
    chain_id: 'test-1',
    denom: 'untrn',
    image: 'neutron-node',
    prefix: 'neutron',
    trace: true,
    type: 'ics',
    upload: [
      './artifacts/contracts',
      './artifacts/contracts_thirdparty',
      './artifacts/scripts/init-neutrond.sh',
    ],
    post_init: ['CHAINID=test-1 CHAIN_DIR=/opt /opt/init-neutrond.sh'],
    genesis_opts: {
      'app_state.crisis.constant_fee.denom': 'untrn',
      'app_state.interchainaccounts.host_genesis_state.params.allow_messages': [
        '*',
      ],
    },
    config_opts: {
      'consensus.timeout_commit': '1s',
      'consensus.timeout_propose': '1s',
    },
    app_opts: {
      'api.enable': 'true',
      'api.swagger': 'true',
      'grpc.enable': 'true',
      'minimum-gas-prices': '0.0025untrn',
      'rosetta.enable': 'true',
      'telemetry.prometheus-retention-time': 1000,
    },
  },
};


const relayersConfig = {
  hermes: {
    balance: '1000000000',
    binary: 'hermes',
    config: {
      'chains.0.trusting_period': '14days',
      'chains.0.unbonding_period': '504h0m0s',
    },
    image: 'hermes',
    log_level: 'trace',
    type: 'hermes',
  },
  neutron: {
    balance: '1000000000',
    binary: 'neutron-query-relayer',
    image: 'neutron-org/neutron-query-relayer',
    log_level: 'info',
    type: 'neutron',
  },
};

type Keys = (typeof keys)[number];

const awaitFirstBlock = async (rpc: string): Promise<void> =>
    waitFor(async () => {
      try {
        const client = await StargateClient.connect(rpc);
        const block = await client.getBlock();
        if (block.header.height > 1) {
          return true;
        }
      } catch (e) {
        return false;
      }
    }, 20_000);

const awaitNeutronChannels = async (rest: string, rpc: string): Promise<void> =>
    waitFor(async () => {
      try {
        const client = new NeutronClient({
          apiURL: `http://${rest}`,
          rpcURL: rpc,
          prefix: 'neutron',
        });
        const res = await client.IbcCoreChannelV1.query.queryChannels();
        if (res.data.channels.length > 0) {
          return true;
        }
      } catch (e) {
        return false;
      }
    }, 60_000);

export const generateWallets = async (): Promise<Record<Keys, string>> =>
    keys.reduce(
        async (acc, key) => {
          const accObj = await acc;
          const wallet = await DirectSecp256k1HdWallet.generate(12, {
            prefix: 'neutron',
          });
          accObj[key] = wallet.mnemonic;
          return accObj;
        },
        Promise.resolve({} as Record<Keys, string>),
    );

export const setupPark = async (
    context = 'lido',
    networks: string[] = [],
    needRelayers = false,
): Promise<cosmopark> => {
  const wallets = await generateWallets();
  const config: CosmoparkConfig = {
    context,
    networks: {},
    master_mnemonic: wallets.master,
    multicontext: true,
    wallets: {
      demowallet1: {
        mnemonic: wallets.demowallet1,
        balance: '1000000000',
      },
      demo1: { mnemonic: wallets.demo1, balance: '1000000000' },
      demo2: { mnemonic: wallets.demo2, balance: '1000000000' },
      demo3: { mnemonic: wallets.demo3, balance: '1000000000' },
    },
  };
  for (const network of networks) {
    config.networks[network] = networkConfigs[network];
  }
  if (needRelayers) {
    config.relayers = [
      {
        ...relayersConfig.hermes,
        networks,
        connections: [networks],
        mnemonic: wallets.hermes,
      } as any,
      {
        ...relayersConfig.neutron,
        networks,
        mnemonic: wallets.ibcrelayer,
      },
    ];
  }
  const instance = await cosmopark.create(config);
  await Promise.all(
      Object.entries(instance.ports).map(([network, ports]) =>
          awaitFirstBlock(`127.0.0.1:${ports.rpc}`).catch((e) => {
            console.log(`Failed to await first block for ${network}: ${e}`);
            throw e;
          }),
      ),
  );
  if (needRelayers) {
    await awaitNeutronChannels(
        `127.0.0.1:${instance.ports['neutron'].rest}`,
        `127.0.0.1:${instance.ports['neutron'].rpc}`,
    ).catch((e) => {
      console.log(`Failed to await neutron channels: ${e}`);
      throw e;
    });
  }
  return instance;
};

export const sleep = async (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

export const waitFor = async (
    fn: () => Promise<boolean>,
    timeout: number = 10000,
    interval: number = 600,
): Promise<void> => {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await fn()) {
      break;
    }
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await sleep(interval);
  }
};

import { AccountData } from '@cosmjs/proto-signing';

export const getAccount = async (
    mnemonic: string,
    prefix: string,
): Promise<AccountData> => {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix,
  });
  const accounts = await wallet.getAccounts();
  return accounts[0];
};
