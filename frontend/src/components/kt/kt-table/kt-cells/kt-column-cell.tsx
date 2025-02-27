import { Cell, CellTemplate, Compatible, Uncertain } from "@silevis/reactgrid";
import { Group, Text, ColorSwatch, ActionIcon, Tooltip, Box, Popover } from "@mantine/core";
import { IconGripVertical, IconSettings } from "@tabler/icons-react";
import { CellPopover } from "./index.utils";
import { KtColumnSettings } from "./kt-column-settings";
import { AnswerTableColumn, useStore } from "@config/store";
import { entityColor } from "@utils/functions";
import { useRef, useState } from "react";
import { useDisclosure } from "@mantine/hooks";
import classes from "./index.module.css";

export interface KtColumnCell extends Cell {
  type: "kt-column";
  column: AnswerTableColumn;
  columnIndex?: number;
}

export class KtColumnCellTemplate implements CellTemplate<KtColumnCell> {
  getCompatibleCell(cell: Uncertain<KtColumnCell>): Compatible<KtColumnCell> {
    if (cell.type !== "kt-column" || !cell.column) {
      throw new Error("Invalid cell type");
    }
    return {
      ...cell,
      type: "kt-column",
      column: cell.column,
      text: cell.column.entityType,
      value: NaN
    };
  }

  isFocusable() {
    return false;
  }

  render({ column, columnIndex }: Compatible<KtColumnCell>) {
    const dragRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [settingsOpened, settingsHandlers] = useDisclosure(false);
    
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
      if (!columnIndex) return;
      
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(columnIndex));
      
      // Add a custom class to the element being dragged
      setTimeout(() => {
        if (dragRef.current) {
          dragRef.current.classList.add('dragging');
        }
      }, 0);
    };
    
    const handleDragEnd = () => {
      if (dragRef.current) {
        dragRef.current.classList.remove('dragging');
      }
    };
    
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      // Add a class to indicate drop target
      if (dragRef.current) {
        dragRef.current.classList.add('drop-target');
        
        // Get the bounding rectangle of the target element
        const rect = e.currentTarget.getBoundingClientRect();
        // Get the x position of the mouse
        const x = e.clientX;
        // Calculate the middle point of the element
        const middle = rect.left + rect.width / 2;
        
        // Add classes to indicate drop position (left or right)
        if (x < middle) {
          dragRef.current.classList.add('drop-left');
          dragRef.current.classList.remove('drop-right');
        } else {
          dragRef.current.classList.add('drop-right');
          dragRef.current.classList.remove('drop-left');
        }
      }
    };
    
    const handleDragLeave = () => {
      // Remove drop target classes
      if (dragRef.current) {
        dragRef.current.classList.remove('drop-target');
        dragRef.current.classList.remove('drop-left');
        dragRef.current.classList.remove('drop-right');
      }
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      
      // Remove drop target classes
      if (dragRef.current) {
        dragRef.current.classList.remove('drop-target');
        dragRef.current.classList.remove('drop-left');
        dragRef.current.classList.remove('drop-right');
      }
      
      if (columnIndex === undefined) return;
      
      const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const targetIndex = columnIndex;
      
      // Get the bounding rectangle of the target element
      const rect = e.currentTarget.getBoundingClientRect();
      // Get the x position of the drop
      const x = e.clientX;
      // Calculate the middle point of the element
      const middle = rect.left + rect.width / 2;
      
      // If dropping on the left half of the target, insert before the target
      // If dropping on the right half, insert after the target
      let newTargetIndex = targetIndex;
      if (x < middle) {
        // Drop on left side - insert before
        newTargetIndex = targetIndex;
      } else {
        // Drop on right side - insert after
        newTargetIndex = targetIndex + 1;
      }
      
      // Don't do anything if dropping on the same position
      if (sourceIndex === newTargetIndex || sourceIndex + 1 === newTargetIndex) {
        return;
      }
      
      // Adjust the target index if we're moving from left to right
      // because the removal of the source item shifts the indices
      if (sourceIndex < newTargetIndex) {
        newTargetIndex--;
      }
      
      useStore.getState().reorderColumns(sourceIndex, newTargetIndex);
    };

    
    // Single Popover approach - consolidate both popups into one
    return (
      <Popover
        opened={settingsOpened}
        onClose={settingsHandlers.close}
        width={450}
        position="bottom"
        shadow="md"
        withinPortal={true}
        closeOnClickOutside={true}
      >
        <Popover.Target>
          <Tooltip 
            label={column.entityType ? 
              `${column.entityType} (${column.type})\n${column.query ? `Question: ${column.query}` : 'No question defined'}`
              : "Click to create a new column"
            }
            position="bottom"
            withArrow
            multiline
            w={220}
            disabled={settingsOpened} // Disable tooltip when popover is open
          >
            <Box
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onClick={() => {
                try {
                  if (column.entityType) {
                    settingsHandlers.open();
                  }
                } catch (error) {
                  console.error('Error opening column settings:', error);
                }
              }}
              style={{ 
                width: '100%', 
                height: '100%',
                transition: 'background-color 0.2s ease',
                backgroundColor: isHovered || settingsOpened ? 'var(--mantine-color-blue-light-hover)' : undefined,
                cursor: column.entityType ? 'pointer' : 'default'
              }}
            >
              <Group 
                h="100%" 
                pl="xs" 
                gap="xs" 
                wrap="nowrap"
                ref={dragRef}
                draggable={columnIndex !== undefined}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{ cursor: columnIndex !== undefined ? 'grab' : 'default' }}
              >
                {columnIndex !== undefined && (
                  <ActionIcon 
                    variant="transparent" 
                    size="xs"
                    color="gray"
                    style={{ cursor: 'grab' }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <IconGripVertical size={14} />
                  </ActionIcon>
                )}
                <ColorSwatch
                  size={12}
                  color={entityColor(column.entityType).fill}
                />
                <Text fw={500}>{column.entityType}</Text>
                {isHovered && column.entityType && (
                  <ActionIcon 
                    variant="subtle" 
                    size="xs"
                    color="blue"
                    ml="auto"
                    mr="xs"
                    onClick={(e) => {
                      try {
                        e.stopPropagation();
                        settingsHandlers.open();
                      } catch (error) {
                        console.error('Error opening column settings:', error);
                      }
                    }}
                  >
                    <IconSettings size={14} />
                  </ActionIcon>
                )}
              </Group>
            </Box>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown
          onPointerDown={(e: React.PointerEvent) => {
            try {
              e.stopPropagation();
            } catch (error) {
              console.error('Error in Popover.Dropdown onPointerDown:', error);
            }
          }}
          onKeyDown={(e: React.KeyboardEvent) => {
            try {
              e.stopPropagation();
            } catch (error) {
              console.error('Error in Popover.Dropdown onKeyDown:', error);
            }
          }}
          className={classes.dropdown}
          style={{ maxHeight: '80vh', overflowY: 'auto' }}
        >
          <Box p="sm">
            <KtColumnSettings
              value={column}
              onChange={(value, run) => {
                try {
                  useStore.getState().editColumn(column.id, value);
                  if (run) {
                    useStore.getState().rerunColumns([column.id]);
                  }
                  settingsHandlers.close();
                } catch (error) {
                  console.error('Error in column settings onChange:', error);
                }
              }}
              onRerun={() => {
                try {
                  useStore.getState().rerunColumns([column.id]);
                  settingsHandlers.close();
                } catch (error) {
                  console.error('Error in column settings onRerun:', error);
                }
              }}
              onUnwind={() => {
                try {
                  useStore.getState().unwindColumn(column.id);
                  settingsHandlers.close();
                } catch (error) {
                  console.error('Error in column settings onUnwind:', error);
                }
              }}
              onHide={() => {
                try {
                  useStore.getState().editColumn(column.id, { hidden: true });
                  settingsHandlers.close();
                } catch (error) {
                  console.error('Error in column settings onHide:', error);
                }
              }}
              onDelete={() => {
                try {
                  useStore.getState().deleteColumns([column.id]);
                  settingsHandlers.close();
                } catch (error) {
                  console.error('Error in column settings onDelete:', error);
                }
              }}
            />
          </Box>
        </Popover.Dropdown>
      </Popover>
    );
  }
}
