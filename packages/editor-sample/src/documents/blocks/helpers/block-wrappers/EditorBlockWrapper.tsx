import React, { useCallback, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useCurrentBlockId } from '../../../editor/EditorBlock';
import { resetDocument, setSelectedBlockId, useDocument, useSelectedBlockId } from '../../../editor/EditorContext';
import TuneMenu from './TuneMenu';
import { useDrag, useDrop } from 'react-dnd';
import { TEditorBlock } from '../../../editor/core';

const ItemTypes = {
  BLOCK: 'block',
};

interface BlockLocation {
  parentId: string;
  parentType: 'EmailLayout' | 'Container' | 'ColumnsContainer';
  index: number;
  columnIndex: number | null;
  childrenIds: string[];
}

interface DocumentUtils {
  findBlockLocation: (document: any, blockId: string) => any;
  moveBlock: (document: any, dragId: string, hoverId: string, hoverClientY: number, hoverMiddleY: number) => any;
}
interface Operation {
  type: string;
  location: BlockLocation;
  id: string;
}
const DocumentUtils: DocumentUtils = {
  findBlockLocation: (document, blockId) => {
    for (const [parentId, b] of Object.entries(document)) {
      // EmailLayout check
      const block = b as any;
      if (block.type === 'EmailLayout' && block.data.childrenIds?.includes(blockId)) {
        return {
          parentId,
          parentType: 'EmailLayout',
          index: block.data.childrenIds.indexOf(blockId),
          columnIndex: null,
          childrenIds: block.data.childrenIds,
        };
      }

      // Container check
      if (block.type === 'Container' && block.data.props.childrenIds.includes(blockId)) {
        return {
          parentId,
          parentType: 'Container',
          index: block.data.props.childrenIds.indexOf(blockId),
          columnIndex: null,
          childrenIds: block.data.props.childrenIds,
        };
      }

      // ColumnsContainer check
      if (block.type === 'ColumnsContainer') {
        for (let colIndex = 0; colIndex < block.data.props.columns.length; colIndex++) {
          const column = block.data.props.columns[colIndex];
          if (column.childrenIds.includes(blockId)) {
            return {
              parentId,
              parentType: 'ColumnsContainer',
              index: column.childrenIds.indexOf(blockId),
              columnIndex: colIndex,
              childrenIds: column.childrenIds,
            };
          }
        }
      }
    }
    return null;
  },

  moveBlock: (document, dragId, hoverId, hoverClientY, hoverMiddleY) => {
    const sourceLocation = DocumentUtils.findBlockLocation(document, dragId);
    const targetLocation = DocumentUtils.findBlockLocation(document, hoverId);

    if (!sourceLocation || !targetLocation) {
      console.warn('Could not find block locations');
      return document;
    }

    const newDocument: any = { ...document };

    // if the both ids are the part of same children ids
    if (
      sourceLocation.parentId === targetLocation.parentId &&
      sourceLocation.columnIndex === targetLocation.columnIndex
    ) {
      switch (sourceLocation.parentType) {
        case 'EmailLayout':
          // pop and push near target id
          newDocument[sourceLocation.parentId].data.childrenIds = reorderArray(
            sourceLocation.childrenIds,
            sourceLocation.index,
            targetLocation.index
          );
          break;

        case 'Container':
          newDocument[sourceLocation.parentId].data.props.childrenIds = reorderArray(
            sourceLocation.childrenIds,
            sourceLocation.index,
            targetLocation.index
          );
          break;

        case 'ColumnsContainer':
          newDocument[sourceLocation.parentId].data.props.columns[sourceLocation.columnIndex].childrenIds =
            reorderArray(sourceLocation.childrenIds, sourceLocation.index, targetLocation.index);
          break;
      }
    }
    // if both are the part of different childrenIds
    else {
      // We need to perform both in single update so we get rid of the dublicate and delete problem
      const operations = getMovementOperations(
        newDocument,
        sourceLocation,
        targetLocation,
        dragId,
        hoverClientY < hoverMiddleY
      );

      applyOperations(newDocument, operations);
    }

    return newDocument;
  },
};

// Helper function pop and push for the same children ids (reorder)
const reorderArray = (arr: [], fromIndex: number, toIndex: number) => {
  const result = [...arr];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
};

// Generate all needed operations for the move
const getMovementOperations = (
  document: any,
  source: BlockLocation,
  target: BlockLocation,
  dragId: string,
  insertBefore: boolean
) => {
  const operations = [];
  const targetIndex = insertBefore ? target.index : target.index + 1;

  // Create operations for both removal and insertion
  operations.push({
    type: 'remove',
    location: source,
    id: dragId,
  });

  operations.push({
    type: 'insert',
    location: {
      ...target,
      index: targetIndex,
    },
    id: dragId,
  });

  return operations;
};

// Apply all operations atomically
const applyOperations = (document: any, operations: Operation[]) => {
  operations.forEach((op) => {
    const { location, type, id } = op;
    const { parentId, parentType, columnIndex, index } = location;

    switch (parentType) {
      case 'EmailLayout':
        if (type === 'remove') {
          document[parentId].data.childrenIds.splice(index, 1);
        } else {
          document[parentId].data.childrenIds.splice(index, 0, id);
        }
        break;

      case 'Container':
        if (type === 'remove') {
          document[parentId].data.props.childrenIds.splice(index, 1);
        } else {
          document[parentId].data.props.childrenIds.splice(index, 0, id);
        }
        break;

      case 'ColumnsContainer':
        if (type === 'remove') {
          document[parentId].data.props.columns[columnIndex!].childrenIds.splice(index, 1);
        } else {
          document[parentId].data.props.columns[columnIndex!].childrenIds.splice(index, 0, id);
        }
        break;
    }
  });
};
type TEditorBlockWrapperProps = {
  children: JSX.Element;
};
export default function EditorBlockWrapper({ children }: TEditorBlockWrapperProps) {
  const selectedBlockId = useSelectedBlockId();
  const blockId = useCurrentBlockId();
  const document = useDocument();
  const ref = useRef<HTMLDivElement>(null);
  const [mouseInside, setMouseInside] = useState(false);

  const moveBlock = useCallback(
    (dragId: string, hoverId: string, hoverClientY: number, hoverMiddleY: number) => {
      const newDocument = DocumentUtils.moveBlock(document, dragId, hoverId, hoverClientY, hoverMiddleY);

      resetDocument(newDocument);
      setSelectedBlockId(dragId);
    },
    [document]
  );

  const [{ handlerId }, drop] = useDrop({
    accept: ItemTypes.BLOCK,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: any, monitor) {
      if (!ref.current) return;

      const dragId = item.id;
      const hoverId = blockId;

      if (dragId === hoverId) return;
      const nDocument = { ...document };
      const allIds = Object.entries(nDocument).flatMap(([id, b]) => {
        const block = b as any;
        if (block.data?.childrenIds) {
          return block.data.childrenIds;
        } else if (block.data?.props?.childrenIds) {
          return block.data.props.childrenIds;
        } else if (block.data?.props?.columns) {
          return block.data.props.columns.flatMap((c: { childrenIds: [] }) => c.childrenIds);
        }
        return [];
      });

      const hoverIndex = allIds.indexOf(hoverId);
      const dragIndex = allIds.indexOf(dragId);

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset!?.y - hoverBoundingRect.top;

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%
      if (
        (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) ||
        (dragIndex > hoverIndex && hoverClientY > hoverMiddleY)
      ) {
        return;
      }
      moveBlock(dragId, hoverId, hoverClientY, hoverMiddleY);
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.BLOCK,
    item: () => {
      setSelectedBlockId(blockId);
      return { id: blockId };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  drag(drop(ref));
  const outline = !isDragging
    ? selectedBlockId === blockId
      ? '2px dashed rgba(0,121,204, 1)'
      : mouseInside
        ? '2px solid rgba(0,121,204, 0.3)'
        : null
    : null;
  return (
    <Box
      ref={ref}
      data-handler-id={handlerId}
      sx={{
        position: 'relative',
        maxWidth: '100%',
        outlineOffset: '-1px',
        outline,
        border: isDragging ? '2px dashed rgba(0,121,204, 1)' : null,
        cursor: 'move',
      }}
      onMouseEnter={(ev) => {
        if (!isDragging) {
          setMouseInside(true);
          ev.stopPropagation();
        }
      }}
      onMouseLeave={() => {
        if (!isDragging) setMouseInside(false);
      }}
      onClick={(ev) => {
        if (!isDragging) {
          setSelectedBlockId(blockId);
          ev.stopPropagation();
          ev.preventDefault();
        }
      }}
    >
      {selectedBlockId === blockId && <TuneMenu blockId={blockId} />}
      {children}
    </Box>
  );
}
