// Inspection Detail Page — Mobile View (390px)
// Design exported from Paper — Updated with media viewer
// Stack: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
//
// Notes for coding agent:
// - Replace inline SVG icons with lucide-react icons (ChevronLeft, ChevronDown, ChevronRight, Plus, Check, Maximize2)
// - Replace hardcoded data with props/API data
// - Use shadcn/ui components: Button, Select, Input, Textarea, Tabs, TabsList, TabsTrigger, TabsContent
// - Media viewer: Photos/Videos/Actual tabs with 240px hero image, swipe arrows, thumbnails below
// - "Actual" tab = defect photos and condition documentation  
// - Single column layout, all sections stacked
// - Specs: 2-column grid
// - AC Adapter: segmented toggle (OK/Wrong/N/A)
// - Price Summary: vertical stacked list (Buying Price, Total Cost, Selling Price, Est. Profit in green)
// - Footer: boxy segmented bar (Grade | Status | Complete) — no border-radius
// - This is mobile (<768px), see InspectionDetail-Desktop.tsx for desktop

export function InspectionDetailMobile() {
  return (
    <div className="[font-synthesis:none] text-[12px] leading-4 flex overflow-clip w-[390px] h-fit flex-col bg-white antialiased">
      <div className="flex items-center justify-between w-full py-3 px-5 border-b border-b-solid border-b-[#E4E4E7]">
        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <div className="text-[15px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-[18px]">
            Inspect P000002
          </div>
        </div>
        <div className="flex items-center justify-center rounded-[50%] bg-[#18181B] shrink-0 size-7">
          <div className="text-[11px] inline-block text-white font-['Geist',system-ui,sans-serif] font-semibold leading-3.5">
            JM
          </div>
        </div>
      </div>
      <div className="flex flex-col w-full pt-3.5 gap-2 px-5">
        <div className="flex flex-col gap-0.5">
          <div className="text-[14px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-[18px]">
            Apple AirPods Pro MWP22J/A
          </div>
          <div className="inline-block">
            <div className="inline-block text-[12px] text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
              White · Computer · P-Code{" "}
            </div>
            <div className="inline-block text-[12px] text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-4">
              P000002
            </div>
            <div className="inline-block text-[12px] text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
              {" "}· Supplier{" "}
            </div>
            <div className="inline-block text-[12px] text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-4">
              JOA
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col w-full pt-2 gap-3 px-5">
        <div className="rounded-[5px] py-[7px] px-3 bg-[#FEFCE8] border border-solid border-[#FDE68A]">
          <div className="inline-block text-[16px] text-black font-sans leading-5">
            T90365 AirPods Pro MWP22J/A 中古Cランク 当社1ヶ月間保証
          </div>
        </div>
        <div className="flex border-b border-b-solid border-b-[#E4E4E7]">
          <div className="pr-3 border-b-2 border-b-solid border-b-[#18181B] py-1.5">
            <div className="inline-block text-[16px] text-black font-sans leading-5">
              Photos (4)
            </div>
          </div>
          <div className="text-[16px] text-black font-sans leading-5 py-1.5 px-3">
            Videos (0)
          </div>
          <div className="text-[16px] text-black font-sans leading-5 py-1.5 px-3">
            Actual (0)
          </div>
        </div>
        <div className="w-full h-60 flex items-center justify-center relative rounded-[10px] bg-[#F4F4F5] shrink-0">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <div className="absolute left-2 top-[50%] flex items-center justify-center rounded-[50%] bg-[#FFFFFFE6] size-7">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </div>
          <div className="absolute right-2 top-[50%] flex items-center justify-center rounded-[50%] bg-[#FFFFFFE6] size-7">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
          <div className="absolute top-2 right-2 w-[26px] h-[26px] flex items-center justify-center rounded-[5px] bg-[#FFFFFFE6]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </div>
          <div className="absolute bottom-2 right-2 rounded-sm py-0.5 px-[7px] bg-[#00000099]">
            <div className="inline-block text-[16px] text-black font-sans leading-5">
              1 / 4
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          <div className="w-[60px] h-12 flex items-center justify-center rounded-md bg-[#F4F4F5] border-2 border-solid border-[#18181B] shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <div className="w-[60px] h-12 flex items-center justify-center rounded-md bg-[#F4F4F5] shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <div className="w-[60px] h-12 flex items-center justify-center rounded-md bg-[#F4F4F5] shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <div className="w-[60px] h-12 flex items-center justify-center rounded-md bg-[#F4F4F5] shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        </div>
      </div>
      <div className="flex flex-col w-full pt-3 gap-2.5 px-5">
        <div className="flex items-center gap-2">
          <div className="text-[12px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
            Product
          </div>
          <div className="flex items-center rounded-[5px] py-1.5 px-2.5 gap-1 w-[298px] border border-solid border-[#E4E4E7] shrink-0">
            <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
              Keep current
            </div>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#71717A" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
        <div className="text-[14px] leading-[18px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold">
          Specs Check
        </div>
        <div className="flex gap-2.5">
          <div className="flex flex-col grow shrink basis-[0%] gap-0.5">
            <div className="text-[10px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3">
              CPU
            </div>
            <div className="rounded-[5px] py-[7px] px-2 border border-solid border-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                --
              </div>
            </div>
          </div>
          <div className="flex flex-col grow shrink basis-[0%] gap-0.5">
            <div className="text-[10px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3">
              RAM (GB)
            </div>
            <div className="rounded-[5px] py-[7px] px-2 border border-solid border-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                --
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <div className="flex flex-col grow shrink basis-[0%] gap-0.5">
            <div className="text-[10px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3">
              Storage (GB)
            </div>
            <div className="rounded-[5px] py-[7px] px-2 border border-solid border-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                --
              </div>
            </div>
          </div>
          <div className="flex flex-col grow shrink basis-[0%] gap-0.5">
            <div className="text-[10px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3">
              OS Family
            </div>
            <div className="rounded-[5px] py-[7px] px-2 border border-solid border-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                --
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <div className="flex flex-col grow shrink basis-[0%] gap-0.5">
            <div className="text-[10px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3">
              Screen Size
            </div>
            <div className="rounded-[5px] py-[7px] px-2 border border-solid border-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                --
              </div>
            </div>
          </div>
          <div className="flex flex-col grow shrink basis-[0%] gap-0.5">
            <div className="text-[10px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3">
              Keyboard
            </div>
            <div className="rounded-[5px] py-[7px] px-2 border border-solid border-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                --
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <div className="flex flex-col grow shrink basis-[0%] gap-0.5">
            <div className="text-[10px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3">
              GPU
            </div>
            <div className="rounded-[5px] py-[7px] px-2 border border-solid border-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#D4D4D8] font-['Geist',system-ui,sans-serif] leading-4">
                --
              </div>
            </div>
          </div>
          <div className="flex flex-col grow shrink basis-[0%] gap-0.5">
            <div className="text-[10px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3">
              Color
            </div>
            <div className="rounded-[5px] py-[7px] px-2 border border-solid border-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
                White
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col w-full pt-4 gap-2 px-5">
        <div className="text-[14px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-[18px]">
          Defects Found
        </div>
        <div className="flex flex-col rounded-md overflow-clip border border-solid border-[#E4E4E7]">
          <div className="flex items-center justify-between py-[9px] px-3 border-b border-b-solid border-b-[#F4F4F5]">
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
          <div className="flex items-center justify-between py-[9px] px-3 border-b border-b-solid border-b-[#F4F4F5]">
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
          <div className="flex items-center justify-between py-[9px] px-3 border-b border-b-solid border-b-[#F4F4F5]">
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
          <div className="flex items-center justify-between py-[9px] px-3">
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
      <div className="flex flex-col w-full pt-4 gap-2 px-5">
        <div className="text-[14px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-[18px]">
          Functionality Checks
        </div>
        <div className="flex flex-col rounded-md overflow-clip border border-solid border-[#E4E4E7]">
          <div className="flex items-center py-[7px] px-3 border-b border-b-solid border-b-[#F4F4F5]">
            <div className="text-[12px] grow shrink basis-[0%] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
              Keyboard
            </div>
            <div className="flex items-center gap-[3px]">
              <div className="text-[11px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-3.5">
                Not checked
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="flex items-center py-[7px] px-3 border-b border-b-solid border-b-[#F4F4F5]">
            <div className="text-[12px] grow shrink basis-[0%] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
              Trackpad
            </div>
            <div className="flex items-center gap-[3px]">
              <div className="text-[11px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-3.5">
                Not checked
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="flex items-center py-[7px] px-3 border-b border-b-solid border-b-[#F4F4F5]">
            <div className="text-[12px] grow shrink basis-[0%] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
              Ports (USB, HDMI)
            </div>
            <div className="flex items-center gap-[3px]">
              <div className="text-[11px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-3.5">
                Not checked
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="flex items-center py-[7px] px-3 border-b border-b-solid border-b-[#F4F4F5]">
            <div className="text-[12px] grow shrink basis-[0%] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
              Camera
            </div>
            <div className="flex items-center gap-[3px]">
              <div className="text-[11px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-3.5">
                Not checked
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="flex items-center py-[7px] px-3 border-b border-b-solid border-b-[#F4F4F5]">
            <div className="text-[12px] grow shrink basis-[0%] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
              Speakers / Sound
            </div>
            <div className="flex items-center gap-[3px]">
              <div className="text-[11px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-3.5">
                Not checked
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="flex items-center py-[7px] px-3 border-b border-b-solid border-b-[#F4F4F5]">
            <div className="text-[12px] grow shrink basis-[0%] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
              Wi-Fi
            </div>
            <div className="flex items-center gap-[3px]">
              <div className="text-[11px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-3.5">
                Not checked
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
          <div className="flex items-center py-[7px] px-3">
            <div className="text-[12px] grow shrink basis-[0%] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-4">
              Bluetooth
            </div>
            <div className="flex items-center gap-[3px]">
              <div className="text-[11px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-3.5">
                Not checked
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col w-full pt-4 pb-5 gap-3 px-5">
        <div className="flex gap-2.5">
          <div className="flex flex-col gap-0.5 w-32 shrink-0">
            <div className="text-[10px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3">
              Battery (%)
            </div>
            <div className="rounded-[5px] py-[7px] px-2 w-[125px] border border-solid border-[#E4E4E7]">
              <div className="text-[12px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-4">
                e.g. 87
              </div>
            </div>
          </div>
          <div className="flex flex-col grow shrink basis-[0%] gap-0.5">
            <div className="text-[10px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3">
              AC Adapter
            </div>
            <div className="flex">
              <div className="grow shrink basis-[0%] flex justify-center rounded-tl-[5px] rounded-bl-[5px] py-[7px] px-3 border border-solid border-[#E4E4E7]">
                <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                  OK
                </div>
              </div>
              <div className="grow shrink basis-[0%] flex justify-center py-[7px] px-3 border-t border-t-solid border-t-[#E4E4E7] border-b border-b-solid border-b-[#E4E4E7] border-r border-r-solid border-r-[#E4E4E7]">
                <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3.5">
                  Wrong
                </div>
              </div>
              <div className="grow shrink basis-[0%] flex justify-center rounded-tr-[5px] rounded-br-[5px] py-[7px] px-3 bg-[#18181B] border border-solid border-[#18181B]">
                <div className="text-[11px] inline-block text-white font-['Geist',system-ui,sans-serif] font-medium leading-3.5">
                  N/A
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-3">
            Condition Notes
          </div>
          <div className="h-12 rounded-[5px] py-[7px] px-2 border border-solid border-[#E4E4E7] shrink-0">
            <div className="text-[12px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-4">
              Notes...
            </div>
          </div>
        </div>
        <div className="flex flex-col rounded-md overflow-clip border border-solid border-[#E4E4E7]">
          <div className="flex items-center justify-between py-[7px] px-3 bg-[#FAFAFA] border-b border-b-solid border-b-[#E4E4E7]">
            <div className="text-[11px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] font-medium leading-3.5">
              Additional Costs
            </div>
            <div className="flex items-center gap-[3px]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <div className="text-[10px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-3">
                Add
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5 px-3 border-b border-b-solid border-b-[#F4F4F5]">
            <div className="text-[11px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-3.5">
              Screen replacement
            </div>
            <div className="text-[11px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-3.5">
              ¥3,500
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5 px-3">
            <div className="text-[11px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] leading-3.5">
              Battery replacement
            </div>
            <div className="text-[11px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-medium leading-3.5">
              ¥2,000
            </div>
          </div>
        </div>
        <div className="flex flex-col w-[350px] rounded-lg py-3.5 px-4 bg-[#F4F4F5]">
          <div className="flex items-baseline justify-between py-1.5 border-b border-b-solid border-b-[#E4E4E7]">
            <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
              Buying Price
            </div>
            <div className="text-[15px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-[18px]">
              ¥12,000
            </div>
          </div>
          <div className="flex items-baseline justify-between py-1.5 border-b border-b-solid border-b-[#E4E4E7]">
            <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
              Total Cost
            </div>
            <div className="text-[15px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-bold leading-[18px]">
              ¥17,500
            </div>
          </div>
          <div className="flex items-baseline justify-between py-1.5 border-b border-b-solid border-b-[#E4E4E7]">
            <div className="text-[13px] inline-block text-[#71717A] font-['Geist',system-ui,sans-serif] leading-4">
              Selling Price
            </div>
            <div className="text-[15px] inline-block text-[#09090B] font-['Geist',system-ui,sans-serif] font-semibold leading-[18px]">
              ¥22,000
            </div>
          </div>
          <div className="flex items-baseline justify-between pt-2">
            <div className="text-[13px] inline-block text-[#22C55E] font-['Geist',system-ui,sans-serif] font-medium leading-4">
              Est. Profit
            </div>
            <div className="text-[17px] inline-block text-[#22C55E] font-['Geist',system-ui,sans-serif] font-bold leading-[22px]">
              ¥4,500
            </div>
          </div>
        </div>
        <div className="flex w-full">
          <div className="flex items-center justify-center grow shrink basis-[0%] py-[7px] gap-1 border-t border-t-solid border-t-[#E4E4E7] border-l border-l-solid border-l-[#E4E4E7] border-b border-b-solid border-b-[#E4E4E7]">
            <div className="text-[11px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-3.5">
              Grade
            </div>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          <div className="flex items-center justify-center grow shrink basis-[0%] py-[7px] gap-1 border-t border-t-solid border-t-[#E4E4E7] border-l border-l-solid border-l-[#E4E4E7] border-b border-b-solid border-b-[#E4E4E7]">
            <div className="text-[11px] inline-block text-[#A1A1AA] font-['Geist',system-ui,sans-serif] leading-3.5">
              Status
            </div>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          <div className="flex items-center justify-center grow-[1.2] shrink basis-[0%] py-[7px] gap-[5px] bg-[#18181B]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div className="text-[12px] inline-block text-white font-['Geist',system-ui,sans-serif] font-medium leading-4">
              Complete
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
