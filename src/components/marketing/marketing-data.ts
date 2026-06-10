import {
  Video,
  Search,
  PackageCheck,
  MessageSquare,
  ShieldCheck,
  Headphones,
  type LucideIcon,
} from 'lucide-react'

/**
 * Hardcoded marketing copy for the landing page. Mockup values for now —
 * swap real figures/testimonials here before going public (single edit point).
 */

export const HERO_STATS: { value: string; label: string }[] = [
  { value: '30 Days', label: 'Warranty Coverage' },
  { value: 'Live', label: 'Product Testing' },
  { value: 'COD', label: 'Payment Available' },
]

export const SOCIAL_PROOF: { value: string; label: string }[] = [
  { value: '155K', label: 'FB Likes' },
  { value: '500+', label: 'Happy Customers' },
  { value: '173K', label: 'FB Followers' },
]

export const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Video,
    title: 'Live Stream Shopping',
    description:
      'Watch detailed product demonstrations in real-time. See every scratch, test, and verification process as our experts showcase each device.',
  },
  {
    icon: Search,
    title: 'Browse & Search',
    description:
      'Explore our curated selection of refurbished laptops and smartphones. Filter by brand, specifications, and price range to find your perfect match.',
  },
  {
    icon: PackageCheck,
    title: 'Order Tracking',
    description:
      'Track your order from purchase to delivery with Yamato shipping integration. Get real-time updates and delivery notifications.',
  },
  {
    icon: MessageSquare,
    title: 'Direct Communication',
    description:
      'Chat directly with our sellers during live streams. Ask questions, request specific tests, and get instant responses.',
  },
  {
    icon: ShieldCheck,
    title: '30-Day Warranty',
    description:
      'Industry-leading warranty coverage compared to typical 1-2 week warranties from Akihabara stores. We stand behind our quality.',
  },
  {
    icon: Headphones,
    title: 'Technical Support',
    description:
      'Get ongoing technical support even after purchase. Our team helps with setup, troubleshooting, and maintenance tips.',
  },
]

export const TESTIMONIALS: {
  name: string
  initials: string
  quote: string
  rating: number
}[] = [
  {
    name: 'Yuki Nakamura',
    initials: 'YN',
    rating: 5,
    quote:
      'As a student, the 30-day warranty was crucial. When I had a minor issue, they resolved it immediately. The live chat with sellers made me feel confident in my purchase.',
  },
  {
    name: 'Joey Misa',
    initials: 'JM',
    rating: 5,
    quote: 'Just testing',
  },
  {
    name: 'Emma Thompson',
    initials: 'ET',
    rating: 5,
    quote:
      'Best refurbished electronics experience ever. The warranty and support are unmatched in the industry.',
  },
  {
    name: 'Hiroshi Tanaka',
    initials: 'HT',
    rating: 5,
    quote:
      'Transparent, professional, and reliable. The seller answered all my technical questions during the live stream. My iPhone works perfectly and the support team helped with setup.',
  },
  {
    name: 'Maria Santos',
    initials: 'MS',
    rating: 5,
    quote:
      'I was skeptical about buying refurbished, but the live demonstration convinced me. The laptop arrived exactly as shown, and the warranty coverage is amazing. Highly recommended!',
  },
  {
    name: 'Chen Wei',
    initials: 'CW',
    rating: 5,
    quote:
      'Amazing customer service and quality products. The live demonstration feature is game-changing for online electronics shopping.',
  },
]

export const STATS_BAR: { value: string; label: string }[] = [
  { value: '500+', label: 'Happy Customers' },
  { value: '173K', label: 'FB Followers' },
  { value: '30', label: 'Day Warranty' },
  { value: '5.0', label: 'Average Rating' },
]
