import { ContentPage, ContentComingSoon } from '@/components/layout/content-page'

export default function AboutPage() {
  return (
    <ContentPage
      eyebrow="About App"
      title="About Dealz"
      intro="Refurbished tech, done right — watch it tested live, ask anything, buy with a 30-day warranty."
    >
      <ContentComingSoon label="About Dealz" />
    </ContentPage>
  )
}
