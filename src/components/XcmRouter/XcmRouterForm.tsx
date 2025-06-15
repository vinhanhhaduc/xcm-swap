import {
  Button,
  Card,
  Center,
  Divider,
  Group,
  Paper,
  rem,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
  Stepper,
  useMantineColorScheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import type {
  TAsset,
  TNodeDotKsmWithRelayChains,
  TNodeWithRelayChains,
} from '@paraspell/sdk';
import { NODES_WITH_RELAY_CHAINS, isNodeEvm } from '@paraspell/sdk';
import type { TExchangeInput, TExchangeNode } from '@paraspell/xcm-router';
import { IconCoinFilled, IconInfoCircle } from '@tabler/icons-react';
import { ethers } from 'ethers';
import type { PolkadotSigner } from 'polkadot-api';
import {
  connectInjectedExtension,
  getInjectedExtensions,
  type InjectedExtension,
} from 'polkadot-api/pjs-signer';
import type { FC, FormEvent } from 'react';
import { useEffect, useState, useMemo } from 'react';

import { DEFAULT_ADDRESS } from '../../constants';
import {
  useAutoFillWalletAddress,
  useRouterCurrencyOptions,
  useWallet,
} from '../../hooks';
import type { TRouterSubmitType, TWalletAccount } from '../../types';
import { isValidWalletAddress } from '../../utils';
import { showErrorNotification } from '../../utils/notifications';
import AccountSelectModal from '../AccountSelectModal/AccountSelectModal';
import { ParachainSelect } from '../ParachainSelect/ParachainSelect';
import WalletSelectModal from '../WalletSelectModal/WalletSelectModal';
import BalanceCard from '../common/BalanceCard';

export type TRouterFormValues = {
  from?: TNodeDotKsmWithRelayChains;
  exchange?: TExchangeNode[];
  to?: TNodeWithRelayChains;
  currencyFromOptionId: string;
  currencyToOptionId: string;
  recipientAddress: string;
  amount: string;
  slippagePct: string;
  useApi: boolean;
  evmSigner?: PolkadotSigner;
  evmInjectorAddress?: string;
};

export type TRouterFormValuesTransformed = Omit<
  TRouterFormValues,
  'exchange'
> & {
  exchange: TExchangeNode;
  currencyFrom: TAsset;
  currencyTo: TAsset;
};

type Props = {
  onSubmit: (
    values: TRouterFormValuesTransformed,
    submitType: TRouterSubmitType
  ) => void;
  loading: boolean;
};

export const XcmRouterForm = ({ onSubmit, loading }: Props) => {
  const [
    walletSelectModalOpened,
    { open: openWalletSelectModal, close: closeWalletSelectModal },
  ] = useDisclosure(false);
  const [
    accountsModalOpened,
    { open: openAccountsModal, close: closeAccountsModal },
  ] = useDisclosure(false);

  const [extensions, setExtensions] = useState<string[]>([]);
  const [injectedExtension, setInjectedExtension] =
    useState<InjectedExtension>();

  const [accounts, setAccounts] = useState<TWalletAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<TWalletAccount>();

  const onAccountSelect = (account: TWalletAccount) => {
    setSelectedAccount(account);
    closeAccountsModal();
  };

  useEffect(() => {
    if (!selectedAccount || !injectedExtension) return;

    const account = injectedExtension
      ?.getAccounts()
      .find((account) => account.address === selectedAccount.address);
    if (!account) {
      throw new Error('No selected account');
    }

    form.setFieldValue('evmSigner', account.polkadotSigner);
    form.setFieldValue('evmInjectorAddress', selectedAccount.address);
  }, [selectedAccount, injectedExtension]);

  const form = useForm<TRouterFormValues>({
    initialValues: {
      from: undefined,
      exchange: ['HydrationDex'],
      to: undefined,
      currencyFromOptionId: '',
      currencyToOptionId: '',
      amount: '10',
      recipientAddress: DEFAULT_ADDRESS,
      slippagePct: '1',
      useApi: false,
    },

    validate: {
      recipientAddress: (value) =>
        isValidWalletAddress(value) ? null : 'Invalid address',
      currencyFromOptionId: (value) => {
        return value ? null : 'Currency from selection is required';
      },
      currencyToOptionId: (value) => {
        return value ? null : 'Currency to selection is required';
      },
      exchange: (value, values) => {
        if (value === undefined && !values.from) {
          return 'Origin must be set to use Auto select';
        }
        return null;
      },
    },
    validateInputOnChange: ['exchange'],
  });

  useAutoFillWalletAddress(form, 'recipientAddress');

  const { from, to, exchange } = form.getValues();
  const { currencyFromOptionId, currencyToOptionId } = form.values;

  const onAccountDisconnect = () => {
    setSelectedAccount(undefined);
    form.setFieldValue('evmSigner', undefined);
    form.setFieldValue('evmInjectorAddress', undefined);
    closeAccountsModal();
  };

  const selectProvider = async (walletName: string) => {
    try {
      const extension = await connectInjectedExtension(walletName);
      setInjectedExtension(extension);

      const allAccounts = extension.getAccounts();
      const evmAccounts = allAccounts.filter((acc) =>
        ethers.isAddress(acc.address)
      );
      if (!evmAccounts.length) {
        showErrorNotification('No EVM accounts found in the selected wallet');
        return;
      }

      setAccounts(
        evmAccounts.map((acc) => ({
          address: acc.address,
          meta: {
            name: acc.name,
            source: extension.name,
          },
        }))
      );

      closeWalletSelectModal();
      openAccountsModal();
    } catch (_e) {
      showErrorNotification('Failed to connect to wallet');
    }
  };

  const onProviderSelect = (walletName: string) => {
    void selectProvider(walletName);
  };

  const getExchange = (exchange: TExchangeNode[] | undefined) => {
    if (Array.isArray(exchange)) {
      if (exchange.length === 1) {
        return exchange[0];
      }

      if (exchange.length === 0) {
        return undefined;
      }
    }

    return exchange;
  };

  const {
    currencyFromOptions,
    currencyFromMap,
    currencyToOptions,
    currencyToMap,
    isFromNotParaToPara,
    isToNotParaToPara,
    adjacency,
  } = useRouterCurrencyOptions(
    from,
    getExchange(exchange) as TExchangeInput,
    to,
    currencyFromOptionId,
    currencyToOptionId
  );

  const pairKey = (asset?: { multiLocation?: object; symbol?: string }) =>
    asset?.multiLocation ? JSON.stringify(asset.multiLocation) : asset?.symbol;

  const selectedCurrencyFrom = useMemo(
    () => currencyFromMap[currencyFromOptionId],
    [currencyFromMap, currencyFromOptionId]
  );

  const selectedCurrencyTo = useMemo(
    () => currencyToMap[currencyToOptionId],
    [currencyToMap, currencyToOptionId]
  );

  useEffect(() => {
    if (!currencyFromOptionId || !currencyToOptionId) return;

    const fromAsset = currencyFromMap[currencyFromOptionId];
    const toAsset = currencyToMap[currencyToOptionId];

    const fromKey = pairKey(fromAsset);
    const toKey = pairKey(toAsset);

    if (fromKey && toKey && !adjacency.get(fromKey)?.has(toKey)) {
      form.setFieldValue('currencyToOptionId', '');
    }
  }, [
    currencyFromOptionId,
    currencyToOptionId,
    currencyFromMap,
    currencyToMap,
    adjacency,
    form,
  ]);

  useEffect(() => {
    if (currencyFromOptionId && !currencyFromMap[currencyFromOptionId]) {
      form.setFieldValue('currencyFromOptionId', '');
      form.setFieldValue('currencyToOptionId', '');
    }
    if (currencyToOptionId && !currencyToMap[currencyToOptionId]) {
      form.setFieldValue('currencyToOptionId', '');
    }
  }, [
    currencyFromMap,
    currencyToMap,
    currencyFromOptionId,
    currencyToOptionId,
    form,
  ]);

  const onSubmitInternal = (
    values: TRouterFormValues,
    _event: FormEvent<HTMLFormElement> | undefined,
    submitType: TRouterSubmitType = 'default'
  ) => {
    const currencyFrom = currencyFromMap[values.currencyFromOptionId];
    const currencyTo = currencyToMap[values.currencyToOptionId];

    if (!currencyFrom || !currencyTo) {
      return;
    }

    const amountInWei = currencyFrom.decimals
      ? ethers.parseUnits(values.amount, currencyFrom.decimals).toString()
      : values.amount;

    const transformedValues = {
      ...values,
      amount: amountInWei,
      exchange: getExchange(values.exchange) as TExchangeNode,
      currencyFrom,
      currencyTo: currencyTo as TAsset,
    };

    onSubmit(transformedValues, submitType);
  };

  const infoEvmWallet = (
    <Tooltip
      label="You need to connect yout Polkadot EVM wallet when choosing EVM chain as origin"
      position="top-end"
      withArrow
      transitionProps={{ transition: 'pop-bottom-right' }}
    >
      <Text component="div" style={{ cursor: 'help' }}>
        <Center>
          <IconInfoCircle
            style={{ width: rem(18), height: rem(18) }}
            stroke={1.5}
          />
        </Center>
      </Text>
    </Tooltip>
  );

  useEffect(() => {
    form.validateField('exchange');
  }, [form.values.from]);

  useEffect(() => {
    if (isFromNotParaToPara) {
      form.setFieldValue(
        'currencyFromOptionId',
        Object.keys(currencyFromMap)[0]
      );
    }
  }, [isFromNotParaToPara, currencyFromMap]);

  useEffect(() => {
    if (isToNotParaToPara) {
      form.setFieldValue('currencyToOptionId', Object.keys(currencyToMap)[0]);
    }
  }, [isToNotParaToPara, currencyToMap]);

  const {
    connectWallet,
    selectedAccount: selectedAccountPolkadot,
    isInitialized,
    isLoadingExtensions,
  } = useWallet();

  const { colorScheme } = useMantineColorScheme();

  const glassStyle =
    colorScheme === 'dark'
      ? {
          background: 'rgba(31, 32, 41, 0.6)',
          border: '1px solid rgba(255,255,255,0.06)',
        }
      : {
          background: 'rgba(255, 255, 255, 0.75)',
          border: '1px solid rgba(0,0,0,0.05)',
        };

  const onConnectWalletClick = () => void connectWallet();

  // Filter out EVM-compatible parachains, since the app doesn't support an Ethereum provider.
  const parachainOptions = useMemo(
    () =>
      (NODES_WITH_RELAY_CHAINS as unknown as any[]).filter((opt: any) => {
        const node = typeof opt === 'string' ? opt : opt.value;
        return !isNodeEvm(node as TNodeWithRelayChains);
      }),
    []
  );

  return (
    <Paper
      p="xl"
      radius="xl"
      style={{
        ...glassStyle,
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <form onSubmit={form.onSubmit(onSubmitInternal)}>
        <Stack gap="lg">
          <Stepper
            orientation="horizontal"
            size="sm"
            active={from && to ? 1 : 0}
            color="mainColor.4"
            allowNextStepsSelect={false}
            styles={{
              stepBody: { marginLeft: rem(8) },
            }}
          >
            <Stepper.Step
              label="Step 1"
              description="Select chains"
              completedIcon={<IconCoinFilled size={14} />}
              color="mainColor.4"
            />
            <Stepper.Step
              label="Step 2"
              description="Enter details"
              completedIcon={<IconCoinFilled size={14} />}
              color="mainColor.4"
            />
          </Stepper>
          <WalletSelectModal
            isOpen={walletSelectModalOpened}
            onClose={closeWalletSelectModal}
            providers={extensions}
            onProviderSelect={onProviderSelect}
          />

          <AccountSelectModal
            isOpen={accountsModalOpened}
            onClose={closeAccountsModal}
            accounts={accounts}
            onAccountSelect={onAccountSelect}
            title="Select EVM account"
            onDisconnect={onAccountDisconnect}
          />

          {/* Chain selectors side-by-side */}
          <Group gap="md" grow align="flex-end" wrap="wrap">
            <ParachainSelect
              label="Origin"
              placeholder="Select origin chain"
              description="Step 1: Choose the chain you're sending from"
              data={parachainOptions}
              allowDeselect={true}
              required={false}
              clearable
              data-testid="select-from"
              style={{ flex: 1 }}
              {...form.getInputProps('from')}
            />

            <ParachainSelect
              label="Destination"
              placeholder="Select destination chain"
              data={[...parachainOptions]}
              data-testid="select-to"
              description="Step 1: Choose the chain that will receive the swapped assets"
              allowDeselect={true}
              required={false}
              clearable
              style={{ flex: 1 }}
              {...form.getInputProps('to')}
            />
          </Group>

          {from && to && (
            <>
              <Card
                withBorder
                radius="lg"
                p="md"
                style={{
                  background:
                    colorScheme === 'dark'
                      ? 'rgba(255,255,255,0.04)'
                      : 'rgba(0,0,0,0.04)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <Group gap="xs" grow align="flex-end" wrap="wrap">
                  <Select
                    variant="filled"
                    key={`${from?.toString()}${exchange?.toString()}${to?.toString()}currencyFrom`}
                    label="Currency From"
                    placeholder="Pick value"
                    data={currencyFromOptions}
                    allowDeselect={false}
                    disabled={isFromNotParaToPara}
                    searchable
                    required
                    clearable
                    data-testid="select-currency-from"
                    {...form.getInputProps('currencyFromOptionId')}
                    onClear={() => {
                      form.setFieldValue('currencyFromOptionId', '');
                      form.setFieldValue('currencyToOptionId', '');
                    }}
                  />

                  <Select
                    variant="filled"
                    key={`${from?.toString()}${exchange?.toString()}${to?.toString()}${currencyFromOptionId}currencyTo`}
                    label="Currency To"
                    placeholder="Pick value"
                    data={currencyToOptions}
                    allowDeselect={false}
                    disabled={isToNotParaToPara}
                    searchable
                    required
                    data-testid="select-currency-to"
                    {...form.getInputProps('currencyToOptionId')}
                  />
                </Group>
              </Card>

              {/* Basic inputs in a row */}
              <Group gap="md" grow wrap="wrap" align="flex-end">
                <TextInput
                  variant="filled"
                  label="Recipient address"
                  placeholder="Enter SS58 or Ethereum address"
                  required
                  data-testid="input-recipient-address"
                  style={{ flex: 2 }}
                  {...form.getInputProps('recipientAddress')}
                />

                <TextInput
                  variant="filled"
                  label="Amount"
                  placeholder="0"
                  required
                  data-testid="input-amount"
                  style={{ flex: 1 }}
                  {...form.getInputProps('amount')}
                />

                <TextInput
                  variant="filled"
                  label="Slippage (%)"
                  placeholder="1"
                  required
                  data-testid="input-slippage-pct"
                  style={{ maxWidth: 120 }}
                  {...form.getInputProps('slippagePct')}
                />
              </Group>

              {selectedAccountPolkadot ? (
                <Button
                  variant="gradient"
                  gradient={{
                    from: 'mainColor.4',
                    to: 'mainColor.8',
                    deg: 135,
                  }}
                  radius="xl"
                  type="submit"
                  loading={loading}
                  fullWidth
                  data-testid="submit"
                >
                  Submit transaction
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={onConnectWalletClick}
                  data-testid="btn-connect-wallet"
                  loading={!isInitialized || isLoadingExtensions}
                >
                  Connect wallet
                </Button>
              )}

              {/* Balances display */}
              {currencyFromOptionId && currencyToOptionId && (
                <Group gap="md" justify="center" wrap="wrap">
                  {from && selectedCurrencyFrom && selectedAccountPolkadot && (
                    <BalanceCard
                      title="Origin balance"
                      node={from as TNodeWithRelayChains}
                      asset={selectedCurrencyFrom as TAsset}
                      address={selectedAccountPolkadot.address}
                    />
                  )}
                  {to && selectedCurrencyTo && form.values.recipientAddress && (
                    <BalanceCard
                      title="Destination balance"
                      node={to as TNodeWithRelayChains}
                      asset={selectedCurrencyTo as TAsset}
                      address={form.values.recipientAddress}
                    />
                  )}
                </Group>
              )}
            </>
          )}
        </Stack>
      </form>
    </Paper>
  );
};
