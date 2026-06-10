import { ContentPage, ContentComingSoon } from '@/components/layout/content-page'

export default function FaqPage() {
  return (
    <ContentPage
      eyebrow="Support"
      title="Frequently Asked Questions"
      intro="Answers about live shopping, warranties, shipping, and payment."
    >
      <ContentComingSoon label="the FAQ" />
    </ContentPage>
  )
}
