if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "E:/gradle-cache/caches/8.13/transforms/6823fe358553562c84113480bc7aa033/transformed/hermes-android-0.81.5-debug/prefab/modules/libhermes/libs/android.x86_64/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "E:/gradle-cache/caches/8.13/transforms/6823fe358553562c84113480bc7aa033/transformed/hermes-android-0.81.5-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

