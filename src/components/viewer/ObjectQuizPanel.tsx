import React, { useState, useEffect } from 'react';
import {
  Paper,
  Title,
  Text,
  Stack,
  Group,
  Pill,
  TextInput,
  Button,
  Alert,
  ThemeIcon,
  Box,
  SimpleGrid,
} from '@mantine/core';
import { Calculator, CheckCircle2, XCircle } from 'lucide-react';
import type { ParameterDef } from '../geometry/shared';

export type TaskType = 'objem' | 'povrch' | 'obvod' | 'obsah';

interface Props {
  objectName: string;
  shapeBadge: string;
  params: Record<string, number>;
  parameterDefs: ParameterDef[];
  taskType: TaskType;
  unit: string;
  answerMode: 'number' | 'choices';
  onAnswerModeChange: (mode: 'number' | 'choices') => void;
  choices?: string[];
  onCheck: (answer: string) => void;
  checked: boolean;
  correct: boolean;
  correctValue: string;
}

function randomIntInRange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function generateRandomParams(parameterDefs: ParameterDef[]): Record<string, number> {
  const p: Record<string, number> = {};
  for (const d of parameterDefs) {
    const lo = Math.max(1, Math.ceil(d.min));
    const hi = Math.min(10, Math.floor(d.max));
    p[d.id] = randomIntInRange(lo, hi);
  }
  return p;
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

export function ObjectQuizPanel({
  objectName,
  shapeBadge,
  params,
  parameterDefs,
  taskType,
  unit,
  answerMode,
  onAnswerModeChange,
  choices,
  onCheck,
  checked,
  correct,
  correctValue,
}: Props) {
  const [inputValue, setInputValue] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  useEffect(() => {
    setSelectedChoice(null);
  }, [choices]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (answerMode === 'choices' && selectedChoice != null) {
      onCheck(selectedChoice);
    } else if (answerMode === 'number') {
      onCheck(inputValue.trim());
    }
  };

  const TASK_LABEL_MAP: Record<string, string> = {
    objem: 'Objem', povrch: 'Povrch', obvod: 'Obvod', obsah: 'Obsah',
  };
  const TASK_SENTENCE_MAP: Record<string, string> = {
    objem: 'Vypočítejte objem tělesa.',
    povrch: 'Vypočítejte povrch tělesa.',
    obvod: 'Vypočítejte obvod útvaru.',
    obsah: 'Vypočítejte obsah útvaru.',
  };
  const taskLabel = TASK_LABEL_MAP[taskType] ?? taskType;
  const taskSentence = TASK_SENTENCE_MAP[taskType] ?? `Vypočítejte ${taskType} tělesa.`;

  const paramColorSets: { bg: string; text: string; label: string }[] = [
    { bg: '#e7f5ff', text: '#1971c2', label: '#1864ab' },
    { bg: '#ebfbee', text: '#2f9e44', label: '#2b8a3e' },
    { bg: '#fff4e6', text: '#d9480f', label: '#c2410c' },
    { bg: '#fff5f5', text: '#c92a2a', label: '#a61e1e' },
    { bg: '#f3f0ff', text: '#5c7cfa', label: '#4c6ef5' },
    { bg: '#e3fafc', text: '#0c8599', label: '#0b7285' },
    { bg: '#e6fcf5', text: '#087f5b', label: '#066d4b' },
    { bg: '#fff0f6', text: '#c2255c', label: '#a61e4d' },
  ];

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Title order={3} fw={500} c="dark.8">
          {objectName}
        </Title>
        <Pill size="sm" variant="contrast" c="blue">
          Cvičení
        </Pill>
      </Group>

      <Stack gap="md">
        {/* Zadání – Mantine Paper */}
        <Paper shadow="sm" radius="lg" p="md" withBorder>
          <Group gap="sm">
            <ThemeIcon size="lg" radius="md" variant="light" color="blue">
              <Calculator size={20} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.5} mb={4}>
                Úloha
              </Text>
              <Text fw={600} c="dark.7" size="md">
                {taskSentence}
              </Text>
            </div>
          </Group>
        </Paper>

        {/* Zadané rozměry – velké barevné karty */}
        <div>
          <Text size="sm" c="dimmed" fw={600} mb="sm" tt="uppercase" lts={0.5}>
            Zadané rozměry
          </Text>
          <SimpleGrid cols={2} spacing="md" verticalSpacing="md">
            {parameterDefs.map((def, i) => {
              const colors = paramColorSets[i % paramColorSets.length];
              return (
                <Paper
                  key={def.id}
                  radius="lg"
                  p="xl"
                  withBorder
                  style={{
                    backgroundColor: colors.bg,
                    borderColor: colors.text,
                    borderWidth: 2,
                  }}
                >
                  <Text
                    size="xs"
                    fw={600}
                    tt="uppercase"
                    lts={0.5}
                    mb={4}
                    style={{ color: colors.label }}
                  >
                    {def.label}
                  </Text>
                  <Text
                    fw={700}
                    style={{
                      fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
                      lineHeight: 1.2,
                      color: colors.text,
                    }}
                  >
                    {params[def.id]}
                    {def.unit ? ` ${def.unit}` : ''}
                  </Text>
                </Paper>
              );
            })}
          </SimpleGrid>
        </div>

        {/* Odpověď – číslo nebo A–D */}
        <form onSubmit={handleSubmit}>
          <Text size="sm" fw={500} mb={6} component="label">
            Vaše odpověď ({taskLabel})
          </Text>
          {answerMode === 'number' ? (
            <Group gap="sm" align="stretch" wrap="nowrap">
              <TextInput
                placeholder="číslo"
                value={inputValue}
                onChange={(e) => setInputValue(e.currentTarget.value)}
                disabled={checked}
                size="md"
                radius="md"
                style={{ flex: 1, minHeight: 80 }}
                styles={{
                  input: {
                    minHeight: 80,
                    height: 80,
                    fontSize: '2rem',
                  },
                }}
              />
              <Text size="sm" c="dimmed" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}>
                {unit}
              </Text>
              <Button
                type="submit"
                disabled={checked || !inputValue.trim()}
                size="md"
                radius="md"
                style={{ minHeight: 80 }}
              >
                Zkontrolovat
              </Button>
            </Group>
          ) : (
            <Group gap="md" align="stretch" wrap="nowrap">
              <Group gap="xs" wrap="wrap" style={{ flex: 1 }}>
                {choices?.map((value, i) => (
                  <Button
                    key={i}
                    type="button"
                    variant={selectedChoice === value ? 'filled' : 'light'}
                    color="blue"
                    radius="xl"
                    size="lg"
                    disabled={checked}
                    onClick={() => setSelectedChoice(value)}
                    style={{
                      fontWeight: 600,
                      fontSize: '1.1rem',
                    }}
                  >
                    {LABELS[i]}) {value} {unit}
                  </Button>
                ))}
              </Group>
              <Button
                type="submit"
                disabled={checked || selectedChoice == null}
                size="lg"
                radius="xl"
                style={{ alignSelf: 'center' }}
              >
                Zkontrolovat
              </Button>
            </Group>
          )}
        </form>

        {/* Zpětná vazba – Mantine Alert */}
        {checked && (
          <Alert
            variant="light"
            color={correct ? 'green' : 'red'}
            radius="md"
            title={correct ? 'Správně' : 'Špatná odpověď'}
            icon={correct ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          >
            {correct
              ? 'Výborně, výsledek je správný.'
              : `Správný výsledek: ${correctValue} ${unit}`}
          </Alert>
        )}
      </Stack>
    </Box>
  );
}
