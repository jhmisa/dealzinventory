import { ContentPage, ContentComingSoon } from '@/components/layout/content-page'

export default function TokushohoPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="特定商取引法に基づく表記"
      intro="Notation based on the Act on Specified Commercial Transactions."
    >
      <ContentComingSoon label="this notice" />
    </ContentPage>
  )
}
