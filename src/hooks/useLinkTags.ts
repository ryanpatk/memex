import { useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { linkKeys } from './useLinks'
import { errorMeta, type MutationHookOptions } from '../utils/mutationErrors'

export const linkTagsApi = { setForLink: repository.links.setTags }

export const useSetLinkTags = (options?: MutationHookOptions) => {
  const queryClient = useQueryClient()

  return useMutation({
    meta: errorMeta(options),
    mutationFn: ({ linkId, tagIds }: { linkId: string; tagIds: string[] }) =>
      linkTagsApi.setForLink(linkId, tagIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linkKeys.lists() })
    },
  })
}
