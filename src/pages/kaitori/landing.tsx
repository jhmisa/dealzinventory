import { useNavigate } from 'react-router-dom'
import { Smartphone, CheckCircle2, Truck, Banknote, ArrowRight, ShieldCheck, Clock, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const STEPS = [
  { icon: Smartphone, title: 'Assess Your Device', description: 'Select your model and answer a few questions about its condition.' },
  { icon: CheckCircle2, title: 'Get an Instant Quote', description: 'We calculate a fair price based on model, specs, and condition.' },
  { icon: Truck, title: 'Ship or Walk In', description: 'Send your device by mail (free shipping) or bring it to our office.' },
  { icon: Banknote, title: 'Get Paid', description: 'After inspection, receive payment via cash or bank transfer.' },
]

export default function KaitoriLandingPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-12 py-8">
      {/* Hero */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Sell Your Device
        </h1>
        <p className="text-lg text-muted-foreground max-w-lg mx-auto">
          Get an instant quote for your laptop, phone, or tablet.
          We buy all brands and conditions — fast payment guaranteed.
        </p>
        <Button size="lg" onClick={() => navigate('/sell/assess')}>
          Start Assessment
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      {/* How It Works */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-center">How It Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((step, i) => (
            <Card key={i} className="text-center">
              <CardContent className="pt-6 pb-4 space-y-3">
                <div className="mx-auto w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                  {i + 1}
                </div>
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <step.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Trust Indicators */}
      <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span>Secure Transactions</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <span>Fast Payment</span>
        </div>
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-primary" />
          <span>Fair Market Prices</span>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center bg-muted/50 rounded-lg p-8 space-y-4">
        <h2 className="text-xl font-bold">Ready to sell?</h2>
        <p className="text-muted-foreground">
          It only takes 2 minutes to get your quote. No obligations.
        </p>
        <Button size="lg" onClick={() => navigate('/sell/assess')}>
          Get My Quote
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
