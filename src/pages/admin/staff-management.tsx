import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Plus, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Separator } from '@/components/ui/separator'
import { PageHeader, TableSkeleton } from '@/components/shared'
import { useStaffProfiles, useUpdateStaffProfile, useInviteStaff, useSetStaffPassword } from '@/hooks/use-staff-profiles'
import { sendPasswordSetupEmail } from '@/services/staff-profiles'
import { useAuth } from '@/hooks/use-auth'
import {
  inviteStaffSchema,
  editStaffSchema,
  setPasswordSchema,
  type InviteStaffFormValues,
  type EditStaffFormValues,
  type SetPasswordFormValues,
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
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<InviteStaffFormValues>({
    resolver: zodResolver(inviteStaffSchema),
    defaultValues: {
      send_setup_email: true,
    },
  })

  const selectedRole = watch('role')
  const sendSetupEmail = watch('send_setup_email')

  function handleOpenChange(open: boolean) {
    if (!open) {
      reset()
      setShowPassword(false)
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="team@dealz.jp"
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

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Password (optional)</Label>
            <p className="text-xs text-muted-foreground -mt-2">
              Set a password now, or leave blank to send a setup email.
            </p>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min 8 characters"
                {...register('password')}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}

            <div className="relative">
              <Input
                id="confirm_password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm password"
                {...register('confirm_password')}
              />
            </div>
            {errors.confirm_password && (
              <p className="text-sm text-destructive">{errors.confirm_password.message}</p>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="send_setup_email"
                checked={sendSetupEmail}
                onCheckedChange={(checked) => setValue('send_setup_email', checked === true)}
              />
              <Label htmlFor="send_setup_email" className="text-sm font-normal cursor-pointer">
                Send password setup email
              </Label>
            </div>
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
  const [showPassword, setShowPassword] = useState(false)
  const setPasswordMutation = useSetStaffPassword()

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

  const passwordForm = useForm<SetPasswordFormValues>({
    resolver: zodResolver(setPasswordSchema),
  })

  const selectedRole = watch('role')
  const isActive = watch('is_active')
  const isSelf = staff?.id === currentUserId

  function handleOpenChange(open: boolean) {
    if (!open) {
      reset()
      passwordForm.reset()
      setShowPassword(false)
    }
    onOpenChange(open)
  }

  function handleSetPassword(values: SetPasswordFormValues) {
    if (!staff) return
    setPasswordMutation.mutate(
      { userId: staff.id, password: values.password },
      {
        onSuccess: () => {
          toast.success(`Password updated for ${staff.display_name}`)
          passwordForm.reset()
          setShowPassword(false)
        },
        onError: (err) => toast.error(`Failed to set password: ${err.message}`),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Edit Team Member
          </DialogTitle>
        </DialogHeader>

        {staff && (
          <div className="space-y-4 py-2">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                    Inactive members cannot log in.
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

            <Separator />

            <form onSubmit={passwordForm.handleSubmit(handleSetPassword)} className="space-y-3">
              <Label className="text-sm font-medium">Set Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="New password"
                  {...passwordForm.register('password')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {passwordForm.formState.errors.password && (
                <p className="text-sm text-destructive">{passwordForm.formState.errors.password.message}</p>
              )}

              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm password"
                {...passwordForm.register('confirm_password')}
              />
              {passwordForm.formState.errors.confirm_password && (
                <p className="text-sm text-destructive">{passwordForm.formState.errors.confirm_password.message}</p>
              )}

              <Button type="submit" variant="secondary" size="sm" disabled={setPasswordMutation.isPending}>
                {setPasswordMutation.isPending ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </div>
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
    const password = values.password && values.password.length >= 8 ? values.password : undefined
    inviteMutation.mutate({ email: values.email, displayName: values.display_name, role: values.role, password }, {
      onSuccess: async () => {
        if (!password && values.send_setup_email) {
          try {
            await sendPasswordSetupEmail(values.email)
            toast.success(`Team member created — password setup email sent to ${values.email}`)
          } catch {
            toast.success('Team member created, but failed to send password setup email. You can resend from the edit dialog.')
          }
        } else if (password) {
          toast.success(`Team member created with password set for ${values.email}`)
        } else {
          toast.success(`Team member created — no email sent. Set a password from the edit dialog.`)
        }
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
          toast.success('Team member updated')
          setEditStaff(null)
        },
        onError: (err) => toast.error(`Failed to update member: ${err.message}`),
      },
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Team Management"
        description="Manage team accounts, roles, and access."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Invite Team Member
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
              Failed to load team members. Please try again.
            </div>
          ) : !profiles?.length ? (
            <div className="p-6 text-sm text-muted-foreground">
              No team members found.
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
