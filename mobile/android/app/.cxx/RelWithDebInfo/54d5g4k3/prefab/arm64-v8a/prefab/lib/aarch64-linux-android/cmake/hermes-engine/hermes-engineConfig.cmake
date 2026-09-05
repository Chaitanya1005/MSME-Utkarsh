if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "E:/gradle-cache/caches/8.13/transforms/2018d842dc5e4cefaa7f9cdeb7977ac1/transformed/hermes-android-0.81.5-release/prefab/modules/libhermes/libs/android.arm64-v8a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "E:/gradle-cache/caches/8.13/transforms/2018d842dc5e4cefaa7f9cdeb7977ac1/transformed/hermes-android-0.81.5-release/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

