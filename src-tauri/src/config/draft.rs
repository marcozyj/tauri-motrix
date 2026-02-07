use std::sync::Arc;

use parking_lot::{MappedMutexGuard, Mutex, MutexGuard};

use super::{motrix::IMotrix, IAria2Temp};

#[derive(Debug, Clone)]
pub struct Draft<T: Clone + ToOwned> {
    inner: Arc<Mutex<(T, Option<T>)>>,
}

macro_rules! draft_define {
    ($id: ident) => {
        #[allow(dead_code)]
        impl Draft<$id> {
            pub fn data(&self) -> MappedMutexGuard<$id> {
                MutexGuard::map(self.inner.lock(), |inner| &mut inner.0)
            }

            pub fn latest(&self) -> MappedMutexGuard<$id> {
                MutexGuard::map(self.inner.lock(), |inner| {
                    if inner.1.is_none() {
                        &mut inner.0
                    } else {
                        inner.1.as_mut().unwrap()
                    }
                })
            }
            pub fn draft(&self) -> MappedMutexGuard<$id> {
                MutexGuard::map(self.inner.lock(), |inner| {
                    if inner.1.is_none() {
                        inner.1 = Some(inner.0.clone());
                    }

                    inner.1.as_mut().unwrap()
                })
            }
            pub fn apply(&self) -> Option<$id> {
                let mut inner = self.inner.lock();

                match inner.1.take() {
                    Some(draft) => {
                        let old_value = inner.0.to_owned();
                        inner.0 = draft.to_owned();
                        Some(old_value)
                    }
                    None => None,
                }
            }
            pub fn discard(&self) -> Option<$id> {
                let mut inner = self.inner.lock();
                inner.1.take()
            }
        }
        impl From<$id> for Draft<$id> {
            fn from(data: $id) -> Self {
                Draft {
                    inner: Arc::new(Mutex::new((data, None))),
                }
            }
        }
    };
}

draft_define!(IMotrix);
draft_define!(IAria2Temp);
