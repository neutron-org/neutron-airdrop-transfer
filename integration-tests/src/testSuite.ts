import cosmopark, { CosmoparkConfig } from '@neutron-org/cosmopark';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { StargateClient } from '@cosmjs/stargate';
import { Client as NeutronClient } from '@neutron-org/client-ts';
import { waitFor } from "./helpers/sleep";

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
    chain_id: 'testgaia-1',
    denom: 'uatom',
    image: 'gaia-node-airdroptest',
    prefix: 'cosmos',
    validators: 1,
    validators_balance: '1000000000',
    genesis_opts: {
      'app_state.staking.params.bond_denom': 'uatom',
      'app_state.interchainaccounts.host_genesis_state.params.allow_messages': [
        '*',
      ],
    },
    config_opts: {
      'rpc.laddr': 'tcp://0.0.0.0:26657',
    },
    app_opts: {
      'api.enable': true,
      'api.swagger': true,
      'grpc.enable': true,
      'minimum-gas-prices': '0uatom',
      'rosetta.enable': true,
    },
  },
  neutron: {
    binary: 'neutrond',
    chain_id: 'testneutron-1',
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
    post_init: ['CHAINID=testneutron-1 CHAIN_DIR=/opt /opt/init-neutrond.sh'],
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
    image: 'hermes-airdroptest',
    log_level: 'trace',
    type: 'hermes',
  }
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
          let channels = res.data.channels;
          if (channels.every((c) => c.state === 'STATE_OPEN')) {
            return true;
          }
        }
      } catch (e) {
        console.log('failed to find channels: ' + e.message)
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
      demowallet1: { mnemonic: wallets.demowallet1, balance: '1000000000' },
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
    ];
  }
  const instance = await cosmopark.create(config);
  await Promise.all(
      Object.entries(instance.ports).map(([network, ports]) => {
            return awaitFirstBlock(`127.0.0.1:${ports.rpc}`).catch((e) => {
              throw e;
            })
          }
      ),
  );
  if (needRelayers) {
    await awaitNeutronChannels(
        `127.0.0.1:${instance.ports['neutron'].rest}`,
        `127.0.0.1:${instance.ports['neutron'].rpc}`,
    ).catch((e) => {
      throw e;
    });
  }
  return instance;
};
