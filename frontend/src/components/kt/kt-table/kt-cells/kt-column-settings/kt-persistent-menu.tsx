import { ReactNode, useState } from "react";
import { Box, BoxProps, Group, Input, Popover } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "@utils/functions";
import classes from "../../../../menu-button/index.module.css";

interface Props extends BoxProps {
  disabled?: boolean;
  label: ReactNode;
  rightSection?: ReactNode;
  content: ReactNode;
}

/**
 * A component similar to MenuButton but using Popover instead of Menu
 * to prevent automatic closing when content is clicked.
 */
export function PersistentMenu({
  label,
  rightSection,
  disabled,
  content,
  ...props
}: Props) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      position="right-start"
      offset={2}
      withinPortal={true}
      disabled={disabled}
      opened={opened}
      onChange={setOpened}
      trapFocus={false}
      closeOnEscape={true}
    >
      <Popover.Target>
        <Box 
          {...props} 
          className={cn(classes.menuButton, props.className)}
          onClick={(e) => {
            e.stopPropagation();
            setOpened((o) => !o);
          }}
        >
          <Input.Label>{label}</Input.Label>
          <Group>
            <Box>{rightSection}</Box>
            <IconChevronRight size={16} />
          </Group>
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        {content}
      </Popover.Dropdown>
    </Popover>
  );
}
