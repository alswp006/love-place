//
//  WeaveWidgetBundle.swift
//  WeaveWidget
//
//  Created by 김민제 on 9/23/26.
//

import WidgetKit
import SwiftUI

@main
struct WeaveWidgetBundle: WidgetBundle {
    var body: some Widget {
        WeaveWidget()
        WeaveWidgetControl()
    }
}
