import { ReactNode, useEffect, useId } from "react";
import { Box, Popover, ScrollArea } from "@mantine/core";
import { Wrap } from "@components";
import { cn } from "@utils/functions";
import { useStore } from "@config/store";
import classes from "./index.module.css";

// Add global handlers to manage popovers
// This is done once at the module level to avoid adding multiple listeners
let isGlobalHandlersAdded = false;
const setupGlobalHandlers = () => {
  if (isGlobalHandlersAdded) return;
  
  // Keyboard handler to close popovers when Escape is pressed
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const store = useStore.getState();
      if (store.activePopoverId) {
        store.setActivePopover(null);
      }
    }
  });
  
  isGlobalHandlersAdded = true;
};

// Setup the global handlers
if (typeof document !== 'undefined') {
  setupGlobalHandlers();
}

interface CellPopoverProps {
  monoClick?: boolean;
  mainAxisOffset?: number;
  target: ReactNode | ((props: { handleOpen: () => void }) => ReactNode);
  dropdown: ReactNode;
  scrollable?: boolean;
}

export { CellPopover };
export type { CellPopoverProps };

function CellPopover({
  monoClick,
  mainAxisOffset = 1,
  target,
  dropdown,
  scrollable
}: CellPopoverProps) {
  // Generate a unique ID for this popover
  const id = useId();
  
  // Use global state to track which popover is active
  const activePopoverId = useStore(state => state.activePopoverId);
  const setActivePopover = useStore(state => state.setActivePopover);
  
  // Determine if this popover is open
  const opened = activePopoverId === id;
  
  // Close popover when component unmounts
  useEffect(() => {
    return () => {
      if (activePopoverId === id) {
        setActivePopover(null);
      }
    };
  }, [activePopoverId, id, setActivePopover]);
  
  // Handle opening and closing
  const handleOpen = () => {
    setActivePopover(id);
  };
  
  const handleClose = () => {
    if (activePopoverId === id) {
      setActivePopover(null);
    }
  };
  
  useEffect(() => {
    if (opened) {
      const handleClickOutside = (event: MouseEvent) => {
        if (!event.target) return;
        const targetElement = event.target as HTMLElement;
        const isInsideDropdown = !!targetElement.closest(`.${classes.dropdown}`);
        const isInsideTarget = !!targetElement.closest(`.${classes.target}`);
        const isInsidePopover = isInsideDropdown || isInsideTarget;
        const isInsideMantineMenu = (function() {
          const targetEl = event.target as Element;
          if (Array.from(targetEl.classList || []).some(cls => cls.includes('mantine')) || targetEl.hasAttribute('data-mantine-stop-propagation')) return true;
          let currentEl: Element | null = targetEl;
          while (currentEl) {
            if (currentEl.classList && Array.from(currentEl.classList).some(cls => cls.includes('mantine'))) return true;
            if (currentEl.hasAttribute('data-menu-dropdown') || currentEl.hasAttribute('data-menu-item') || currentEl.hasAttribute('data-position') || currentEl.hasAttribute('data-mantine-stop-propagation')) return true;
            currentEl = currentEl.parentElement;
          }
          return false;
        })();


        if (!isInsidePopover && !isInsideMantineMenu) {
          handleClose();
        }
      };
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [opened, handleClose]);

  return (
    <Popover
      opened={opened}
      onClose={handleClose}
      offset={{ mainAxis: mainAxisOffset, crossAxis: -1 }}
      width="target"
      position="bottom-start"
      transitionProps={{ transition: "scale-y" }}
      withinPortal={true}
    >
      <Popover.Target>
        <Box
          className={cn(classes.target, opened && classes.active)}
          {...(monoClick
            ? { onClick: handleOpen }
            : { onDoubleClick: handleOpen })}
        >
          {typeof target === 'function' ? target({ handleOpen }) : target}
        </Box>
      </Popover.Target>
      <Popover.Dropdown
        onPointerDown={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
        className={classes.dropdown}
      >
        <Wrap
          with={
            scrollable &&
            (node => (
              <ScrollArea.Autosize mah={500}>{node}</ScrollArea.Autosize>
            ))
          }
        >
          <Box p="sm">{dropdown}</Box>
        </Wrap>
      </Popover.Dropdown>
    </Popover>
  );
}
