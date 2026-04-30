-- Enable realtime for order_items so live-selling notifications work
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
