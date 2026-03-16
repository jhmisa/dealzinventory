import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Smartphone, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MediaUploader } from '@/components/shared/media'
import { useProductModels } from '@/hooks/use-product-models'
import { useCreateKaitoriRequest, useLookupQuote, useAddKaitoriMedia } from '@/hooks/use-kaitori'
import { kaitoriRequestSchema } from '@/validators/kaitori'
import type { KaitoriRequestFormValues } from '@/validators/kaitori'
import {
  BATTERY_CONDITIONS,
  SCREEN_CONDITIONS,
  BODY_CONDITIONS,
  KAITORI_DELIVERY_METHODS,
} from '@/lib/constants'
import { formatPrice, cn } from '@/lib/utils'

type Step = 'model' | 'condition' | 'photos' | 'delivery' | 'quote'

export default function KaitoriAssessPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('model')
  const [quotePrice, setQuotePrice] = useState<number | null>(null)
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([])
  const [createdId, setCreatedId] = useState<string | null>(null)

  const { data: productModels } = useProductModels()
  const form = useForm<KaitoriRequestFormValues>({
    resolver: zodResolver(kaitoriRequestSchema),
    defaultValues: {
      product_model_id: '',
      seller_notes: '',
    },
  })

  const selectedModelId = form.watch('product_model_id')

  const lookupQuoteMutation = useLookupQuote()
  const createMutation = useCreateKaitoriRequest()
  const addMediaMutation = useAddKaitoriMedia()

  const steps: Step[] = ['model', 'condition', 'photos', 'delivery', 'quote']
  const currentIdx = steps.indexOf(step)

  function goNext() {
    if (currentIdx < steps.length - 1) {
      const nextStep = steps[currentIdx + 1]
      // When moving to quote step, look up the price
      if (nextStep === 'quote') {
        fetchQuote()
      }
      setStep(nextStep)
    }
  }

  function goBack() {
    if (currentIdx > 0) setStep(steps[currentIdx - 1])
  }

  function fetchQuote() {
    const values = form.getValues()
    lookupQuoteMutation.mutate({
      productModelId: values.product_model_id,
      batteryCondition: values.battery_condition,
      screenCondition: values.screen_condition,
      bodyCondition: values.body_condition,
    }, {
      onSuccess: (price) => setQuotePrice(price),
    })
  }

  async function handleSubmit(values: KaitoriRequestFormValues) {
    // For MVP, use a placeholder customer_id (real flow uses customer-auth)
    createMutation.mutate({
      ...values,
      customer_id: '00000000-0000-0000-0000-000000000000',
      auto_quote_price: quotePrice ?? 0,
      request_status: 'QUOTED',
    }, {
      onSuccess: async (request) => {
        // Upload any photos to the request
        for (const url of uploadedPhotos) {
          await addMediaMutation.mutateAsync({ kaitoriRequestId: request.id, fileUrl: url, role: 'other' })
        }
        setCreatedId(request.id)
        toast.success('Quote submitted!')
      },
      onError: (err) => toast.error(`Failed: ${err.message}`),
    })
  }

  // Success view
  if (createdId) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold">Quote Submitted!</h2>
        <p className="text-muted-foreground">
          Your estimated quote is <span className="font-bold text-primary">{formatPrice(quotePrice ?? 0)}</span>.
        </p>
        <p className="text-sm text-muted-foreground">
          We'll review your submission and confirm the offer. You'll receive an update via email.
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={() => navigate('/sell')}>
            Back to Sell Page
          </Button>
          <Button onClick={() => navigate('/shop')}>
            Browse Shop
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => currentIdx === 0 ? navigate('/sell') : goBack()}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        {currentIdx === 0 ? 'Back to Sell Page' : 'Back'}
      </Button>

      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Smartphone className="h-6 w-6" />
        Device Assessment
      </h1>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
              i <= currentIdx ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}>
              {i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={cn('w-8 h-0.5', i < currentIdx ? 'bg-primary' : 'bg-muted')} />
            )}
          </div>
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          {/* Step 1: Model Selection */}
          {step === 'model' && (
            <Card>
              <CardHeader>
                <CardTitle>Select Your Device</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="product_model_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand & Model *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your device" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(productModels ?? []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.brand} {m.model_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Button type="button" onClick={goNext} disabled={!selectedModelId}>
                    Next <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Condition Quiz */}
          {step === 'condition' && (
            <Card>
              <CardHeader>
                <CardTitle>Device Condition</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="battery_condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Battery Health *</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="grid gap-2">
                          {BATTERY_CONDITIONS.map((b) => (
                            <Label
                              key={b.value}
                              className={cn(
                                'flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50',
                                field.value === b.value && 'border-primary bg-primary/5',
                              )}
                            >
                              <RadioGroupItem value={b.value} />
                              <div>
                                <span className="font-medium">{b.label}</span>
                                <span className="text-xs text-muted-foreground ml-2">{b.description}</span>
                              </div>
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="screen_condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Screen Condition *</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="grid gap-2">
                          {SCREEN_CONDITIONS.map((s) => (
                            <Label
                              key={s.value}
                              className={cn(
                                'flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50',
                                field.value === s.value && 'border-primary bg-primary/5',
                              )}
                            >
                              <RadioGroupItem value={s.value} />
                              <div>
                                <span className="font-medium">{s.label}</span>
                                <span className="text-xs text-muted-foreground ml-2">{s.description}</span>
                              </div>
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="body_condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Body Condition *</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="grid gap-2">
                          {BODY_CONDITIONS.map((b) => (
                            <Label
                              key={b.value}
                              className={cn(
                                'flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50',
                                field.value === b.value && 'border-primary bg-primary/5',
                              )}
                            >
                              <RadioGroupItem value={b.value} />
                              <div>
                                <span className="font-medium">{b.label}</span>
                                <span className="text-xs text-muted-foreground ml-2">{b.description}</span>
                              </div>
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={goBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button
                    type="button"
                    onClick={goNext}
                    disabled={!form.watch('battery_condition') || !form.watch('screen_condition') || !form.watch('body_condition')}
                  >
                    Next <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Photos */}
          {step === 'photos' && (
            <Card>
              <CardHeader>
                <CardTitle>Upload Photos (Optional)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload photos of your device to help us provide an accurate quote.
                  Include front, back, screen, and any damage photos.
                </p>
                <MediaUploader
                  bucket="kaitori-media"
                  pathPrefix="temp-assessment"
                  onUpload={(url) => setUploadedPhotos(prev => [...prev, url])}
                />
                {uploadedPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploadedPhotos.map((url, i) => (
                      <div key={i} className="w-20 h-20 rounded border overflow-hidden">
                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="seller_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Anything else we should know about your device..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={goBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button type="button" onClick={goNext}>
                    Next <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Delivery Method */}
          {step === 'delivery' && (
            <Card>
              <CardHeader>
                <CardTitle>Delivery Method</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="delivery_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How will you send your device? *</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="grid gap-3">
                          {KAITORI_DELIVERY_METHODS.map((d) => (
                            <Label
                              key={d.value}
                              className={cn(
                                'flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-muted/50',
                                field.value === d.value && 'border-primary bg-primary/5',
                              )}
                            >
                              <RadioGroupItem value={d.value} />
                              <span className="font-medium">{d.label}</span>
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={goBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button type="button" onClick={goNext} disabled={!form.watch('delivery_method')}>
                    View Quote <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Quote Result */}
          {step === 'quote' && (
            <Card>
              <CardHeader>
                <CardTitle>Your Quote</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center py-6 bg-primary/5 rounded-lg">
                  {lookupQuoteMutation.isPending ? (
                    <p className="text-lg text-muted-foreground">Calculating...</p>
                  ) : quotePrice != null ? (
                    <>
                      <p className="text-sm text-muted-foreground mb-1">Estimated Purchase Price</p>
                      <p className="text-4xl font-bold text-primary">{formatPrice(quotePrice)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-1">Estimated Purchase Price</p>
                      <p className="text-xl text-muted-foreground">Price not available for this configuration</p>
                      <p className="text-sm text-muted-foreground mt-2">Submit your request and we'll provide a custom quote.</p>
                    </>
                  )}
                </div>

                {/* Summary */}
                <div className="border rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Device</span>
                    <span>{productModels?.find(m => m.id === form.watch('product_model_id'))?.model_name ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Battery</span>
                    <span>{BATTERY_CONDITIONS.find(b => b.value === form.watch('battery_condition'))?.label ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Screen</span>
                    <span>{SCREEN_CONDITIONS.find(s => s.value === form.watch('screen_condition'))?.label ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Body</span>
                    <span>{BODY_CONDITIONS.find(b => b.value === form.watch('body_condition'))?.label ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery</span>
                    <span>{KAITORI_DELIVERY_METHODS.find(d => d.value === form.watch('delivery_method'))?.label ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Photos</span>
                    <span>{uploadedPhotos.length} uploaded</span>
                  </div>
                </div>

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={goBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    size="lg"
                  >
                    {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </form>
      </Form>
    </div>
  )
}
