import { useMutation, useQueryClient } from '@tanstack/react-query'
import { repository } from '../data/repository'
import { linkKeys } from './useLinks'

export const linkTagsApi = { setForLink: repository.links.setTags }

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
