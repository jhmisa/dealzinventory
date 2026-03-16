import { Link } from 'react-router-dom'

export function ShopFooter() {
  return (
    <footer className="border-t bg-muted/50 mt-auto">
      <div className="container py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-semibold mb-3">Dealz K.K.</h3>
            <p className="text-sm text-muted-foreground">
              Quality refurbished electronics in Japan.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-3">Quick Links</h3>
            <nav className="space-y-2 text-sm">
              <Link to="/shop" className="block text-muted-foreground hover:text-foreground">Shop</Link>
              <Link to="/sell" className="block text-muted-foreground hover:text-foreground">Sell Your Device</Link>
              <Link to="/account" className="block text-muted-foreground hover:text-foreground">My Account</Link>
            </nav>
          </div>
          <div>
            <h3 className="font-semibold mb-3">Legal</h3>
            <nav className="space-y-2 text-sm text-muted-foreground">
              <p>特定商取引法に基づく表記</p>
              <p>古物営業法に基づく表記</p>
            </nav>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Dealz K.K. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
