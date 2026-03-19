// Inspection Detail Page — Desktop View (1440px)
// Design exported from Paper — Updated with media viewer
// Stack: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
//
// Notes for coding agent:
// - Replace inline SVG icons with lucide-react icons (Check, Plus, ChevronDown, ChevronLeft, ChevronRight, Maximize2, Edit)
// - Replace hardcoded data with props/API data
// - Use shadcn/ui components: Button, Select, Input, Textarea, Tabs, TabsList, TabsTrigger, TabsContent
// - Media viewer: Photos/Videos/Actual tabs with swipeable hero image, thumbnails below
// - "Actual" tab = defect photos and condition documentation
// - Implement image carousel with @dnd-kit/sortable for thumbnail reordering
// - Two-column layout: Media viewer + Specs/Defects on the right
// - Segmented toggle for AC Adapter (Correct/Incorrect/Missing)
// - Additional Costs: expandable list with "+ Add Cost"
// - Price summary bar: right-aligned (Buying Price | Total Cost | Selling Price (editable) | Est. Profit in green)
// - Footer: Grade dropdown + Status dropdown + Complete Inspection button, all right-aligned
// - Make responsive: this is desktop (>=1024px), see InspectionDetail-Mobile.tsx for mobile

export function InspectionDetailDesktop() {
  return (
    <div className="[font-synthesis:none] text-[12px] leading-4 flex overflow-clip w-[1440px] h-fit flex-col bg-white antialiased">
      <div className="flex items-center justify-between w-full py-4 px-12 bg-white border-b border-b-solid border-b-[#E4E4E7]">
        <div className="flex items-center gap-2">
          <div className="text-[20px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-6">
            Inventory
          </div>
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
            / Inspection / Detail
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
            jhmisa@proton.me
          </div>
          <div className="flex items-center justify-center rounded-[50%] bg-[#18181B] shrink-0 size-8">
            <div className="text-[13px] inline-block text-white font-['Geist',system-ui,sans-serif] font-semibold leading-4">
              JM
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col w-full pt-7 gap-5 px-12">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-[24px] leading-[30px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-bold">
              Inspect P000002
            </div>
            <div className="text-[14px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-[18px]">
              Apple AirPods Pro MWP22J/A · White · Computer
            </div>
            <div className="flex items-center pt-1 gap-3">
              <div className="flex items-center gap-[5px]">
                <div className="text-[12px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
                  P-Code
                </div>
                <div className="text-[12px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-4">
                  P000002
                </div>
              </div>
              <div className="w-px h-3.5 bg-[#E4E4E7] shrink-0" />
              <div className="flex items-center gap-[5px]">
                <div className="text-[12px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
                  Supplier
                </div>
                <div className="text-[12px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">
                  JOA
                </div>
              </div>
              <div className="w-px h-3.5 bg-[#E4E4E7] shrink-0" />
              <div className="flex items-center gap-[5px]">
                <div className="text-[12px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
                  Product
                </div>
                <div className="flex items-center rounded-sm py-[3px] px-2.5 gap-1 border border-solid border-[#E4E4E7]">
                  <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                    Keep current
                  </div>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center shrink-0 rounded-md py-2.5 px-5 gap-2 bg-[#18181B]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div className="text-[13px] inline-block text-white font-['Geist',system-ui,sans-serif] font-medium leading-4">
              Complete Inspection
            </div>
          </div>
        </div>
        <div className="rounded-[5px] py-[7px] px-3 bg-[#FEFCE8] border border-solid border-[#FDE68A]">
          <div className="inline-block text-[16px] text-black font-sans leading-5">
            T90365 AirPods Pro MWP22J/A 中古Cランク 当社1ヶ月間保証
          </div>
        </div>
      </div>
      <div className="flex w-full items-start pt-5 gap-6 px-12">
        <div className="flex flex-col w-[480px] shrink-0 gap-2.5">
          <div className="flex border-b border-b-solid border-b-[#E4E4E7]">
            <div className="pr-3.5 border-b-2 border-b-solid border-b-[#18181B] py-[7px]">
              <div className="inline-block text-[16px] text-black font-sans leading-5">
                Photos (4)
              </div>
            </div>
            <div className="text-[16px] text-black font-sans leading-5 py-[7px] px-3.5">
              Videos (0)
            </div>
            <div className="text-[16px] text-black font-sans leading-5 py-[7px] px-3.5">
              Actual (0)
            </div>
          </div>
          <div className="w-[480px] h-80 flex items-center justify-center relative rounded-[10px] bg-[#F4F4F5] shrink-0">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <div className="absolute left-2.5 top-[50%] flex items-center justify-center rounded-[50%] bg-[#FFFFFFE6] size-8">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </div>
            <div className="absolute right-2.5 top-[50%] flex items-center justify-center rounded-[50%] bg-[#FFFFFFE6] size-8">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
            <div className="absolute top-2.5 right-2.5 flex items-center justify-center rounded-md bg-[#FFFFFFE6] size-7">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </div>
            <div className="absolute bottom-2.5 right-2.5 rounded-sm py-[3px] px-2 bg-[#00000099]">
              <div className="inline-block text-[16px] text-black font-sans leading-5">
                1 / 4
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-[72px] h-14 flex items-center justify-center rounded-md bg-[#F4F4F5] border-2 border-solid border-[#18181B] shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <div className="w-[72px] h-14 flex items-center justify-center rounded-md bg-[#F4F4F5] shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <div className="w-[72px] h-14 flex items-center justify-center rounded-md bg-[#F4F4F5] shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
            <div className="w-[72px] h-14 flex items-center justify-center rounded-md bg-[#F4F4F5] shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </div>
          </div>
        </div>
        <div className="flex flex-col grow shrink basis-[0%] gap-5">
          <div className="flex w-full gap-6">
            <div className="flex flex-col grow shrink basis-[0%] gap-2.5">
              <div className="text-[15px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-[18px]">
                Specs Check
              </div>
              <div className="flex gap-2.5">
                <div className="flex flex-col grow shrink basis-[0%] gap-[3px]">
                  <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                    CPU
                  </div>
                  <div className="rounded-[5px] py-2 px-2.5 border border-solid border-[#E4E4E7]">
                    <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                      --
                    </div>
                  </div>
                </div>
                <div className="flex flex-col grow shrink basis-[0%] gap-[3px]">
                  <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                    RAM (GB)
                  </div>
                  <div className="rounded-[5px] py-2 px-2.5 border border-solid border-[#E4E4E7]">
                    <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                      --
                    </div>
                  </div>
                </div>
                <div className="flex flex-col grow shrink basis-[0%] gap-[3px]">
                  <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                    Storage
                  </div>
                  <div className="rounded-[5px] py-2 px-2.5 border border-solid border-[#E4E4E7]">
                    <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                      --
                    </div>
                  </div>
                </div>
                <div className="flex flex-col grow shrink basis-[0%] gap-[3px]">
                  <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                    OS
                  </div>
                  <div className="rounded-[5px] py-2 px-2.5 border border-solid border-[#E4E4E7]">
                    <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                      --
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2.5">
                <div className="flex flex-col grow shrink basis-[0%] gap-[3px]">
                  <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                    Screen
                  </div>
                  <div className="rounded-[5px] py-2 px-2.5 border border-solid border-[#E4E4E7]">
                    <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                      --
                    </div>
                  </div>
                </div>
                <div className="flex flex-col grow shrink basis-[0%] gap-[3px]">
                  <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                    Keyboard
                  </div>
                  <div className="rounded-[5px] py-2 px-2.5 border border-solid border-[#E4E4E7]">
                    <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                      --
                    </div>
                  </div>
                </div>
                <div className="flex flex-col grow shrink basis-[0%] gap-[3px]">
                  <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                    GPU
                  </div>
                  <div className="rounded-[5px] py-2 px-2.5 border border-solid border-[#E4E4E7]">
                    <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                      --
                    </div>
                  </div>
                </div>
                <div className="flex flex-col grow shrink basis-[0%] gap-[3px]">
                  <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                    Color
                  </div>
                  <div className="rounded-[5px] py-2 px-2.5 border border-solid border-[#E4E4E7]">
                    <div className="text-[12px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
                      White
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex w-full gap-6">
            <div className="flex flex-col grow shrink basis-[0%] gap-2">
              <div className="text-[15px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-[18px]">
                Defects Found
              </div>
              <div className="flex flex-col rounded-md overflow-clip border border-solid border-[#E4E4E7]">
                <div className="flex items-center justify-between py-[9px] px-3.5 border-b border-b-solid border-b-[#F4F4F5]">
                  <div className="text-[13px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
                    Body
                  </div>
                  <div className="flex items-center gap-[3px]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <div className="text-[11px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-3.5">
                      Add
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between py-[9px] px-3.5 border-b border-b-solid border-b-[#F4F4F5]">
                  <div className="text-[13px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
                    Screen
                  </div>
                  <div className="flex items-center gap-[3px]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <div className="text-[11px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-3.5">
                      Add
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between py-[9px] px-3.5 border-b border-b-solid border-b-[#F4F4F5]">
                  <div className="text-[13px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
                    Keyboard
                  </div>
                  <div className="flex items-center gap-[3px]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <div className="text-[11px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-3.5">
                      Add
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between py-[9px] px-3.5">
                  <div className="text-[13px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
                    Other
                  </div>
                  <div className="flex items-center gap-[3px]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <div className="text-[11px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-3.5">
                      Add
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col grow shrink basis-[0%] gap-[3px]">
              <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                Specs Notes
              </div>
              <div className="h-full rounded-[5px] py-2 px-2.5 border border-solid border-[#E4E4E7]">
                <div className="inline-block text-[16px] text-black font-sans leading-5">
                  Any notes about spec discrepancies...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col w-full pb-10 gap-5 px-12">
        <div className="flex w-full gap-8 items-end">
          <div className="flex grow shrink basis-[0%] gap-3 items-end">
            <div className="flex flex-col grow shrink basis-[0%] gap-[3px] self-start">
              <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                Battery Health (%)
              </div>
              <div className="rounded-[5px] py-2 px-2.5 border border-solid border-[#E4E4E7]">
                <div className="text-[12px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-4">
                  e.g. 87
                </div>
              </div>
            </div>
            <div className="flex flex-col grow shrink basis-[0%] gap-[3px] self-start">
              <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                AC Adapter
              </div>
              <div className="flex">
                <div className="rounded-tl-[5px] rounded-bl-[5px] py-2 px-3.5 border border-solid border-[#E4E4E7]">
                  <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                    Correct
                  </div>
                </div>
                <div className="py-2 px-3.5 border-t border-t-solid border-t-[#E4E4E7] border-b border-b-solid border-b-[#E4E4E7] border-r border-r-solid border-r-[#E4E4E7]">
                  <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                    Incorrect
                  </div>
                </div>
                <div className="rounded-tr-[5px] rounded-br-[5px] py-2 px-3.5 bg-[#18181B] border-t border-t-solid border-t-[#E4E4E7] border-b border-b-solid border-b-[#E4E4E7] border-r border-r-solid border-r-[#E4E4E7]">
                  <div className="text-[11px] inline-block text-white font-['Geist',system-ui,sans-serif] font-medium leading-3.5">
                    Missing
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col grow shrink basis-[0%] gap-[3px]">
            <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
              Condition Notes
            </div>
            <div className="h-14 rounded-[5px] py-2 px-2.5 border border-solid border-[#E4E4E7] shrink-0">
              <div className="text-[12px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-4">
                Any additional condition notes...
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col w-full gap-2.5">
          <div className="flex flex-col rounded-md overflow-clip border border-solid border-[#E4E4E7]">
            <div className="flex items-center justify-between py-2 px-3.5 bg-[#FAFAFA] border-b border-b-solid border-b-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] font-medium leading-4">
                Additional Costs
              </div>
              <div className="flex items-center gap-[3px]">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <div className="text-[11px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-3.5">
                  Add Cost
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between py-[7px] px-3.5 border-b border-b-solid border-b-[#F4F4F5]">
              <div className="text-[12px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
                Screen replacement
              </div>
              <div className="text-[12px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">
                ¥3,500
              </div>
            </div>
            <div className="flex items-center justify-between py-[7px] px-3.5">
              <div className="text-[12px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
                Battery replacement
              </div>
              <div className="text-[12px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">
                ¥2,000
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end rounded-md py-3.5 px-5 gap-6 bg-[#F4F4F5]">
            <div className="flex items-center gap-1.5">
              <div className="text-[12px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
                Buying Price
              </div>
              <div className="text-[14px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-[18px]">
                ¥12,000
              </div>
            </div>
            <div className="w-px h-4 bg-[#D4D4D8] shrink-0" />
            <div className="flex items-center gap-1.5">
              <div className="text-[12px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
                Total Cost
              </div>
              <div className="text-[14px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-bold leading-[18px]">
                ¥17,500
              </div>
            </div>
            <div className="w-px h-4 bg-[#D4D4D8] shrink-0" />
            <div className="flex items-center gap-1.5">
              <div className="text-[12px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
                Selling Price
              </div>
              <div className="flex items-center gap-1">
                <div className="text-[14px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-[18px]">
                  ¥22,000
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
            </div>
            <div className="w-px h-4 bg-[#D4D4D8] shrink-0" />
            <div className="flex items-center gap-1.5">
              <div className="text-[12px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
                Est. Profit
              </div>
              <div className="text-[14px] inline-block text-[#22C55E] font-['Geist',system-ui,sans-serif] font-bold leading-[18px]">
                ¥4,500
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end py-4 gap-4 border-t border-t-solid border-t-[#E4E4E7]">
          <div className="flex items-center gap-3">
            <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
              Grade:
            </div>
            <div className="flex items-center rounded-md py-[7px] px-3.5 gap-1 border border-solid border-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-4">
                Choose grade
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <div className="w-px h-4 bg-[#E4E4E7] shrink-0" />
            <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
              Status:
            </div>
            <div className="flex items-center rounded-md py-[7px] px-3.5 gap-1 border border-solid border-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-4">
                Select status
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="flex items-center rounded-md py-2.5 px-6 gap-2 bg-[#18181B]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div className="text-[13px] inline-block text-white font-['Geist',system-ui,sans-serif] font-medium leading-4">
              Complete Inspection
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
