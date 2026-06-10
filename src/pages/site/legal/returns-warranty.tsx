import { ContentPage, ContentComingSoon } from '@/components/layout/content-page'

export default function ReturnsWarrantyPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Returns & Warranty"
      intro="Our 30-day warranty coverage, return eligibility, and how to start a claim."
    >
      <ContentComingSoon label="Returns & Warranty" />
    </ContentPage>
  )
}
