import { useMutation, useQueryClient } from '@tanstack/react-query'
import supabase from '../supabase'
import { getErrorMessage } from '@memex/core'
import { linkKeys } from './useLinks'

export const linkTagsApi = {
  setForLink: async (linkId: string, tagIds: string[]): Promise<void> => {
    try {
      const { error: deleteError } = await supabase
        .from('link_tags')
        .delete()
        .eq('link_id', linkId)

      if (deleteError) throw deleteError

      if (tagIds.length > 0) {
        const inserts = tagIds.map((tagId) => ({
          link_id: linkId,
          tag_id: tagId,
        }))

        const { error: insertError } = await supabase
          .from('link_tags')
          .insert(inserts)

        if (insertError) throw insertError
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error)
      if (!message.includes('link_tags') || !message.includes('does not exist')) {
        throw error
      }
    }

    const { error: linkUpdateError } = await supabase
      .from('links')
      .update({ tag_id: tagIds[0] ?? null })
      .eq('id', linkId)

    if (linkUpdateError) throw linkUpdateError
  },
}

export const useSetLinkTags = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ linkId, tagIds }: { linkId: string; tagIds: string[] }) =>
      linkTagsApi.setForLink(linkId, tagIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linkKeys.lists() })
    },
  })
}
