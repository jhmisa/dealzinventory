import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { PageHeader, TableSkeleton } from '@/components/shared'
import { useStaffProfiles, useUpdateStaffProfile, useInviteStaff } from '@/hooks/use-staff-profiles'
import { useAuth } from '@/hooks/use-auth'
import {
  inviteStaffSchema,
  editStaffSchema,
  type InviteStaffFormValues,
  type EditStaffFormValues,
} from '@/validators/staff-profile'
import type { StaffProfile } from '@/lib/types'

type StaffRole = 'ADMIN' | 'VA' | 'IT' | 'LIVE_SELLER'

const ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: 'Admin',
  VA: 'VA',
  IT: 'IT',
  LIVE_SELLER: 'Live Seller',
}

const ROLE_BADGE_VARIANTS: Record<StaffRole, 'destructive' | 'secondary' | 'default' | 'outline'> = {
  ADMIN: 'destructive',
  VA: 'secondary',
  IT: 'default',
  LIVE_SELLER: 'outline',
}

function RoleBadge({ role }: { role: StaffRole }) {
  return (
    <Badge variant={ROLE_BADGE_VARIANTS[role]}>
      {ROLE_LABELS[role]}
    </Badge>
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? 'default' : 'outline'} className={isActive ? '' : 'text-muted-foreground'}>
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  )
}

// --- Invite Dialog ---

interface InviteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  onSubmit: (values: InviteStaffFormValues) => void
}

function InviteDialog({ open, onOpenChange, loading, onSubmit }: InviteDialogProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<InviteStaffFormValues>({
    resolver: zodResolver(inviteStaffSchema),
  })

  const selectedRole = watch('role')

  function handleOpenChange(open: boolean) {
    if (!open) reset()
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Staff Member</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="staff@dealz.jp"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="display_name">Display Name</Label>
            <Input
              id="display_name"
              placeholder="e.g. Tanaka Hiroshi"
              {...register('display_name')}
            />
            {errors.display_name && (
              <p className="text-sm text-destructive">{errors.display_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={selectedRole}
              onValueChange={(value) => setValue('role', value as StaffRole, { shouldValidate: true })}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="VA">VA</SelectItem>
                <SelectItem value="IT">IT</SelectItem>
                <SelectItem value="LIVE_SELLER">Live Seller</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role.message}</p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Edit Dialog ---

interface EditDialogProps {
  staff: StaffProfile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  currentUserId: string | undefined
  onSubmit: (values: EditStaffFormValues) => void
}

function EditDialog({ staff, open, onOpenChange, loading, currentUserId, onSubmit }: EditDialogProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<EditStaffFormValues>({
    resolver: zodResolver(editStaffSchema),
    values: staff
      ? { display_name: staff.display_name, role: staff.role as StaffRole, is_active: staff.is_active }
      : undefined,
  })

  const selectedRole = watch('role')
  const isActive = watch('is_active')
  const isSelf = staff?.id === currentUserId

  function handleOpenChange(open: boolean) {
    if (!open) reset()
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Edit Staff Member
          </DialogTitle>
        </DialogHeader>

        {staff && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {staff.email}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_display_name">Display Name</Label>
              <Input
                id="edit_display_name"
                {...register('display_name')}
              />
              {errors.display_name && (
                <p className="text-sm text-destructive">{errors.display_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit_role">Role</Label>
              <Select
                value={selectedRole}
                onValueChange={(value) => setValue('role', value as StaffRole, { shouldValidate: true })}
                disabled={isSelf}
              >
                <SelectTrigger id="edit_role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="VA">VA</SelectItem>
                  <SelectItem value="IT">IT</SelectItem>
                  <SelectItem value="LIVE_SELLER">Live Seller</SelectItem>
                </SelectContent>
              </Select>
              {isSelf && (
                <p className="text-xs text-muted-foreground">You cannot change your own role.</p>
              )}
              {errors.role && (
                <p className="text-sm text-destructive">{errors.role.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="is_active" className="text-sm font-medium">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive staff cannot log in.
                </p>
              </div>
              <Switch
                id="is_active"
                checked={isActive}
                onCheckedChange={(checked) => setValue('is_active', checked)}
                disabled={isSelf}
              />
            </div>
            {isSelf && (
              <p className="text-xs text-muted-foreground -mt-2">You cannot deactivate your own account.</p>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- Main Page ---

export default function StaffManagementPage() {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editStaff, setEditStaff] = useState<StaffProfile | null>(null)

  const { user } = useAuth()
  const { data: profiles, isLoading, isError } = useStaffProfiles()
  const inviteMutation = useInviteStaff()
  const updateMutation = useUpdateStaffProfile()

  function handleInvite(values: InviteStaffFormValues) {
    inviteMutation.mutate({ email: values.email, displayName: values.display_name, role: values.role }, {
      onSuccess: () => {
        toast.success('Invite sent successfully')
        setInviteOpen(false)
      },
      onError: (err) => toast.error(`Failed to send invite: ${err.message}`),
    })
  }

  function handleUpdate(values: EditStaffFormValues) {
    if (!editStaff) return
    updateMutation.mutate(
      { id: editStaff.id, updates: values },
      {
        onSuccess: () => {
          toast.success('Staff member updated')
          setEditStaff(null)
        },
        onError: (err) => toast.error(`Failed to update staff: ${err.message}`),
      },
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff Management"
        description="Manage staff accounts, roles, and access."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Invite Staff
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={5} columns={5} />
            </div>
          ) : isError ? (
            <div className="p-6 text-sm text-destructive">
              Failed to load staff members. Please try again.
            </div>
          ) : !profiles?.length ? (
            <div className="p-6 text-sm text-muted-foreground">
              No staff members found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow
                    key={profile.id}
                    className="cursor-pointer"
                    onClick={() => setEditStaff(profile)}
                  >
                    <TableCell className="font-medium">{profile.display_name}</TableCell>
                    <TableCell className="text-muted-foreground">{profile.email}</TableCell>
                    <TableCell>
                      <RoleBadge role={profile.role as StaffRole} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge isActive={profile.is_active} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(profile.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        loading={inviteMutation.isPending}
        onSubmit={handleInvite}
      />

      <EditDialog
        staff={editStaff}
        open={!!editStaff}
        onOpenChange={(open) => { if (!open) setEditStaff(null) }}
        loading={updateMutation.isPending}
        currentUserId={user?.id}
        onSubmit={handleUpdate}
      />
    </div>
  )
}
