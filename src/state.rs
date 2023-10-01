use crate::msg::ExecuteMsg;
use cw_storage_plus::Item;

pub type Stage = ExecuteMsg;

pub const STAGE: Item<Stage> = Item::new("stage");
