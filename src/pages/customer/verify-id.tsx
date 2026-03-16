import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, Upload, CheckCircle2, Clock } from 'lucide-react'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { MediaUploader } from '@/components/shared/media'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import * as customersService from '@/services/customers'
import { formatDateTime } from '@/lib/utils'

export default function CustomerVerifyIdPage() {
  const { customer, refreshCustomer } = useCustomerAuth()
  const [uploading, setUploading] = useState(false)

  const isVerified = customer?.id_verified
  const hasDocument = !!customer?.id_document_url

  async function handleDocumentUpload(url: string) {
    if (!customer) return
    setUploading(true)
    try {
      await customersService.updateCustomer(customer.id, {
        id_document_url: url,
      })
      await refreshCustomer()
      toast.success('ID document uploaded. Our team will review it shortly.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload document')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">ID Verification</h1>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className={`h-5 w-5 ${isVerified ? 'text-green-600' : 'text-amber-500'}`} />
            Verification Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isVerified ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Identity Verified</p>
                <p className="text-sm text-green-600">
                  Verified on {customer?.id_verified_at ? formatDateTime(customer.id_verified_at) : 'N/A'}
                </p>
              </div>
            </div>
          ) : hasDocument ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
              <Clock className="h-8 w-8 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">Under Review</p>
                <p className="text-sm text-amber-600">
                  Your ID document has been submitted and is being reviewed by our team.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted border">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Not Verified</p>
                <p className="text-sm text-muted-foreground">
                  Upload a government-issued ID to complete verification.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Card - show if not verified */}
      {!isVerified && (
        <Card>
          <CardHeader>
            <CardTitle>Upload ID Document</CardTitle>
            <CardDescription>
              Upload a clear photo of your government-issued ID (driver's license, My Number card,
              passport, etc.). This is required for Kaitori transactions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MediaUploader
              bucket="id-documents"
              pathPrefix={`customers/${customer?.id ?? 'unknown'}`}
              onUpload={handleDocumentUpload}
              accept="image/*"
              multiple={false}
              maxSizeBytes={10 * 1024 * 1024}
            />
            {uploading && (
              <p className="text-sm text-muted-foreground">Uploading document...</p>
            )}

            <div className="rounded-lg border p-3 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Important Notes:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Ensure the entire document is visible and legible</li>
                <li>Your photo and name must be clearly readable</li>
                <li>Accepted: Driver's license, My Number card, Passport, Residence card</li>
                <li>Your document will be securely stored and only viewed by authorized staff</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Why is ID verification required?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Under Japanese law (Kobutsueigyo-ho / Act on Control of Secondhand Articles Dealers),
            we are required to verify the identity of individuals selling used goods.
          </p>
          <p>
            ID verification is required to complete Kaitori (device selling) transactions. You can still
            purchase items from our shop without verification.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
