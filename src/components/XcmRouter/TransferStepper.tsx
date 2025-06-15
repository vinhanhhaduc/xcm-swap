import { Timeline, Title } from '@mantine/core';
import type { TRouterEvent, TTransactionType } from '@paraspell/xcm-router';
import { useEffect, useState } from 'react';

type Props = {
  progressInfo?: TRouterEvent;
};

const getStepInfo = (type: TTransactionType) => {
  switch (type) {
    case 'TRANSFER':
      return ['Transfer to exchange', ''];
    case 'SWAP':
      return ['Swap tokens', ''];
    case 'SWAP_AND_TRANSFER':
      return ['Swap tokens & Transfer to destination', ''];
    default:
      return ['Unknown', 'Unknown'];
  }
};

export const TransferStepper = ({ progressInfo }: Props) => {
  const [steps, setSteps] = useState<
    { label: string; description: string; type: TTransactionType }[]
  >([]);

  useEffect(() => {
    if (!progressInfo?.routerPlan) return;

    const newSteps = progressInfo.routerPlan.map((tx) => {
      const [label, description] = getStepInfo(tx.type);
      return { label, description, type: tx.type };
    });

    setSteps(newSteps);
  }, [progressInfo?.routerPlan]);

  const currentStep = progressInfo?.currentStep ?? 0;

  return (
    <Timeline active={currentStep} bulletSize={20} lineWidth={2}>
      {steps.map((step, index) => (
        <Timeline.Item
          key={index}
          title={step.label}
          bullet={index < currentStep ? '✓' : index + 1}
          color={index <= currentStep ? 'teal' : 'gray'}
        >
          {index === currentStep && progressInfo?.type !== 'COMPLETED' && (
            <Title order={6} mt={4} c="dimmed">
              In progress...
            </Title>
          )}
        </Timeline.Item>
      ))}

      {progressInfo?.type === 'COMPLETED' && (
        <Timeline.Item bullet="✓" color="green">
          <Title order={4} ta="center" mt="md">
            Your transaction was successful!
          </Title>
        </Timeline.Item>
      )}
    </Timeline>
  );
};
