import { ReactNode } from "react";
import {
  Box,
  BoxProps,
  Group,
  Input,
  Menu,
  MenuDropdownProps,
  MenuProps
} from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { cn } from "@utils/functions";
import classes from "./index.module.css";

interface Props extends BoxProps {
  disabled?: boolean;
  label: ReactNode;
  rightSection?: ReactNode;
  menu?: ReactNode;
  menuProps?: MenuProps;
  dropdownProps?: MenuDropdownProps;
  closeOnItemClick?: boolean;
}

export function MenuButton({
  label,
  rightSection,
  disabled,
  menu,
  menuProps,
  dropdownProps,
  closeOnItemClick = true,
  ...props
}: Props) {
  return (
    <Menu
      position="right-start"
      offset={2}
      withinPortal={true}
      disabled={disabled}
      closeOnItemClick={closeOnItemClick}
      {...menuProps}
    >
      <Menu.Target>
        <Box 
          {...props} 
          className={cn(classes.menuButton, props.className)}
          onClick={(e) => e.stopPropagation()}
        >
          <Input.Label>{label}</Input.Label>
          <Group>
            <Box>{rightSection}</Box>
            <IconChevronRight size={16} />
          </Group>
        </Box>
      </Menu.Target>
      <Menu.Dropdown 
        {...dropdownProps} 
        onClick={(e) => {
          // Prevent the click from propagating to parent elements
          e.stopPropagation();
          // Prevent the default behavior which might close the menu
          if (!closeOnItemClick && (e.target as Element).closest('.mantine-Menu-item')) {
            e.preventDefault();
          }
        }}
      >
        {menu}
      </Menu.Dropdown>
    </Menu>
  );
}
