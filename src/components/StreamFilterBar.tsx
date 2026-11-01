import { useMemo, useState, type ReactNode } from 'react';
import { ITEM_TYPES, type ItemType, Tag } from '@memex/core';
import { SHOW_TAGS_UI } from '../constants/modules';
import { TAG_COLORS, useCreateTag } from '../hooks/useTags';
import { FilterChip, InlineCreateForm } from './ui';

interface StreamFilterBarProps {
  selectedTypes: ItemType[];
  /** Counts shown on the chips (respect the other active filters). */
  typeCounts: Record<ItemType, number>;
  /**
   * Unfiltered totals for the current scope (Home or one space). Chips are
   * ordered by these, largest first, so the order stays put while searching.
   */
  typeTotals?: Record<ItemType, number>;
  onToggleType: (type: ItemType) => void;
  tags: Tag[];
  tagCounts: Record<string, number>;
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  includeUntagged: boolean;
  untaggedCount: number;
  onToggleUntagged: () => void;
  /** When a selection is active, tag chips apply to the selection instead of filtering. */
  bulkAssignMode?: boolean;
  /** Controls placed directly after the type chips (e.g. the space gear). */
  afterTypes?: ReactNode;
  /** Controls pinned to the right end of the type row (e.g. Select / Clear). */
  trailing?: ReactNode;
}

/**
 * The two chip rows that sit between the omnibar and the grid: element-type
 * filters (Notes · Links · Tasks) and the tag filters scoped to the current
 * stream. Empty selection in either row means "show all".
 */
const StreamFilterBar = ({
  selectedTypes,
  typeCounts,
  typeTotals,
  onToggleType,
  tags,
  tagCounts,
  selectedTagIds,
  onToggleTag,
  includeUntagged,
  untaggedCount,
  onToggleUntagged,
  bulkAssignMode = false,
  afterTypes,
  trailing,
}: StreamFilterBarProps) => {
  const createTag = useCreateTag();
  const [isCreatingTag, setIsCreatingTag] = useState(false);

  // Largest type first; ties keep the canonical Notes · Links · Tasks order
  const orderedTypes = useMemo(() => {
    const totals = typeTotals ?? typeCounts;
    return ITEM_TYPES.map((type, index) => ({ type, index }))
      .sort((a, b) => {
        const diff = (totals[b.type.key] ?? 0) - (totals[a.type.key] ?? 0);
        return diff !== 0 ? diff : a.index - b.index;
      })
      .map(({ type }) => type);
  }, [typeCounts, typeTotals]);

  const handleCreateTag = async (name: string) => {
    try {
      await createTag.mutateAsync({ name, color: TAG_COLORS[0] });
      setIsCreatingTag(false);
    } catch (error) {
      console.error('Failed to create tag:', error);
    }
  };

  const hasTagRow =
    SHOW_TAGS_UI && (tags.length > 0 || untaggedCount > 0 || isCreatingTag || !bulkAssignMode);

  return (
    <div className="memex-stream-filters">
      <div
        className="memex-stream-filter-row is-types"
        role="group"
        aria-label="Filter by element type"
      >
        {orderedTypes.map((type) => (
          <FilterChip
            key={type.key}
            variant="space"
            label={type.plural}
            count={typeCounts[type.key] ?? 0}
            active={selectedTypes.includes(type.key)}
            onClick={() => onToggleType(type.key)}
            title={
              selectedTypes.includes(type.key)
                ? `Stop filtering to ${type.plural.toLowerCase()}`
                : `Show only ${type.plural.toLowerCase()}`
            }
          />
        ))}
        {afterTypes}
        {trailing && <div className="memex-stream-filter-trailing">{trailing}</div>}
      </div>

      {hasTagRow && (
        <div
          className="memex-stream-filter-row is-tags"
          role="group"
          aria-label={bulkAssignMode ? 'Apply a tag to the selection' : 'Filter by tag'}
        >
          {tags.map((tag) => (
            <FilterChip
              key={tag.id}
              variant="tag"
              label={tag.name}
              count={tagCounts[tag.id] ?? 0}
              active={!bulkAssignMode && selectedTagIds.includes(tag.id)}
              bulkTarget={bulkAssignMode}
              onClick={() => onToggleTag(tag.id)}
              title={bulkAssignMode ? `Add “${tag.name}” to selection` : undefined}
            />
          ))}

          {!bulkAssignMode && untaggedCount > 0 && (
            <FilterChip
              variant="tag"
              label="Untagged"
              count={untaggedCount}
              active={includeUntagged}
              onClick={onToggleUntagged}
            />
          )}

          {isCreatingTag ? (
            <InlineCreateForm
              placeholder="Tag name…"
              pending={createTag.isPending}
              onSubmit={handleCreateTag}
              onCancel={() => setIsCreatingTag(false)}
            />
          ) : (
            <button
              type="button"
              className="bookmark-tag-new"
              onClick={() => setIsCreatingTag(true)}
            >
              New tag
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default StreamFilterBar;
