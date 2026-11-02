import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { applyProposal, rejectProposal, type ProposalTarget } from '@memex/core/agent'
import type { InboxProposal } from '@memex/core'
import { repository } from '../data/repository'
import { noteKeys } from './useNotes'
import { taskKeys } from './useTasks'
import { linkKeys } from './useLinks'
import { profileLinkKeys } from './useProfileLinks'
import { profileNoteKeys } from './useProfileNotes'
import { profileTaskKeys } from './useProfileTasks'

export const proposalKeys = {
  all: ['proposals'] as const,
  pending: () => [...proposalKeys.all, 'pending'] as const,
}

/**
 * Agents' pending Inbox proposals (docs/mcp.md → "Proposals"). Agents write
 * them from elsewhere, so the list also refreshes every minute while open,
 * on top of the usual refetch on focus. Not persisted offline.
 */
export const usePendingProposals = () =>
  useQuery({
    queryKey: proposalKeys.pending(),
    queryFn: () => repository.proposals.getPending(),
    refetchInterval: 60_000,
  })

export type ProposalDecision = { proposal: InboxProposal; target: ProposalTarget | null; decision: 'apply' | 'reject' }

/**
 * Approve (apply the change through the Repository, then mark it applied) or
 * reject (the item stays as it is; the proposal is kept, marked rejected).
 */
export const useDecideProposal = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ proposal, target, decision }: ProposalDecision) => {
      if (decision === 'apply') await applyProposal(repository, proposal, target)
      else await rejectProposal(repository, proposal)
    },
    onSuccess: (_data, { proposal, decision }) => {
      queryClient.setQueryData<InboxProposal[]>(proposalKeys.pending(), (prev) => prev?.filter((p) => p.id !== proposal.id))
      if (decision === 'reject') return
      const keys =
        proposal.item_type === 'note'
          ? [noteKeys.all, profileNoteKeys.all]
          : proposal.item_type === 'task'
            ? [taskKeys.all, profileTaskKeys.all]
            : [linkKeys.all, profileLinkKeys.all]
      keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: proposalKeys.all })
    },
  })
}
