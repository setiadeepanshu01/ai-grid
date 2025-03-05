import { ReactNode, useMemo } from "react";
import { Box, Text, Input, InputWrapperProps, Paper } from "@mantine/core";
import { useUncontrolled } from "@mantine/hooks";
import styled from "@emotion/styled";
import {
  MentionsInput,
  Mention as ReactMention,
  SuggestionDataItem
} from "react-mentions";
import { cn } from "@utils/functions";
import classes from "./index.module.css";

interface Props extends Omit<InputWrapperProps, "onChange"> {
  placeholder?: string;
  disabled?: boolean;
  value?: string;
  defaultValue?: string;
  onChange: (value: string) => void;
  options: Array<{
    trigger: string;
    data: SuggestionDataItem[];
    color?: (item: SuggestionDataItem) => string;
    render?: (item: SuggestionDataItem) => ReactNode;
  }>;
}

export function Mention({
  placeholder,
  disabled,
  value: value_,
  defaultValue,
  onChange,
  options,
  ...props
}: Props) {
  const [value, setValue] = useUncontrolled({
    value: value_,
    defaultValue,
    onChange
  });

  const colors = useMemo(() => {
    if (!value) return [];
    
    // Use a more robust regex that can handle multiline text
    // The 's' flag makes . match newlines as well
    const matches = [...(value.matchAll(/.\[[^\]]+\]\((\w+)\)/gs) || [])];
    
    return matches.map(match => {
      const group = options.find(option => match[0].startsWith(option.trigger));
      const option = group?.data.find(item => item.id === match[1]);
      return (option && group?.color?.(option)) || "transparent";
    });
  }, [value, options]);

  return (
    <StyledInputWrapper
      {...props}
      colors={colors}
      className={cn(classes.wrapper, props.className)}
    >
      <MentionsInput
        disabled={disabled}
        allowSpaceInQuery
        allowSuggestionsAboveCursor
        forceSuggestionsAboveCursor={true}
        placeholder={placeholder}
        value={value || ''}
        onChange={e => {
          console.log("Mention input changed:", e.target.value);
          setValue(e.target.value);
        }}
        className="mentions"
        a11ySuggestionsListLabel="Suggested mentions"
        customSuggestionsContainer={node => {
          console.log("Rendering suggestions container:", node);
          return (
            <Paper withBorder shadow="sm" p={4}>
              {node}
            </Paper>
          );
        }}
        singleLine={false}
      >
        {options.map(({ trigger, data, render }) => {
          console.log(`Setting up ReactMention with trigger: ${trigger}, data:`, data);
          return (
            <ReactMention
              key={trigger}
              trigger={trigger}
              data={data}
              appendSpaceOnAdd={false}
              markup={`${trigger}[__display__](__id__)`}
              displayTransform={(id, display) => {
                console.log(`Display transform: ${display} (${id})`);
                return display;
              }}
              onAdd={(id, display) => {
                console.log(`Mention added: ${display} (${id})`);
              }}
              renderSuggestion={(suggestion, _, __, ___, active) => {
                console.log(`Rendering suggestion:`, suggestion);
                return (
                  <Box className={cn(classes.suggestion, active && classes.active)}>
                    {render ? (
                      render(suggestion)
                    ) : (
                      <Text>{suggestion.display}</Text>
                    )}
                  </Box>
                );
              }}
            />
          );
        })}
      </MentionsInput>
    </StyledInputWrapper>
  );
}

const StyledInputWrapper = styled(
  ({ colors, ...props }: InputWrapperProps & { colors: string[] }) => (
    <Input.Wrapper {...props} />
  )
)`
  .mentions__highlighter {
    ${({ colors }) =>
      colors.map(
        (color, index) => `
        > strong:nth-of-type(${index + 1}) {
          background-color: ${color};
        }
      `
      )}
  }
`;
